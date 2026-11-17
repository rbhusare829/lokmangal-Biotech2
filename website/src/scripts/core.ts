/* Shared behaviour for every page: reveals, scroll-linked motion, counters, header, menu, clock, search. */
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));
const isMr = document.documentElement.lang === 'mr';

function initReveal() {
  $$('[data-stagger]').forEach((el) => {
    Array.from(el.children).forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));
  });
  const items = $$('[data-reveal], [data-stagger], [data-words], [data-slide], .spot-bars');
  if (reduced || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: '0px 0px -9% 0px', threshold: 0.06 },
  );
  items.forEach((el) => io.observe(el));
}

/**
 * Scroll progress engine. Each [data-scroll] element gets --p from 0 to 1:
 *  - "scene": across a tall section with a sticky inner frame (top at viewport top → bottom at viewport bottom)
 *  - "read":  from entering low in the viewport until its bottom passes the middle (for text that lights up)
 *  - "view":  from entering at the bottom to leaving at the top (parallax)
 */
function initScroll() {
  const els = $$('[data-scroll]');
  if (!els.length) return;
  if (reduced) {
    els.forEach((el) => el.style.setProperty('--p', el.dataset.scroll === 'view' ? '0.5' : '1'));
    return;
  }
  const visible = new Set<HTMLElement>();
  let raf = 0;
  const update = () => {
    raf = 0;
    const vh = window.innerHeight;
    visible.forEach((el) => {
      const r = el.getBoundingClientRect();
      const mode = el.dataset.scroll;
      let p: number;
      if (mode === 'scene') p = -r.top / Math.max(1, r.height - vh);
      else if (mode === 'read') p = (vh * 0.88 - r.top) / (vh * 0.4 + r.height);
      else p = (vh - r.top) / (vh + r.height);
      p = Math.min(1, Math.max(0, p));
      el.style.setProperty('--p', p.toFixed(4));
    });
  };
  const request = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target as HTMLElement) : visible.delete(e.target as HTMLElement)));
      request();
    },
    { rootMargin: '15% 0px 15% 0px' },
  );
  els.forEach((el) => io.observe(el));
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
}

function initCounters() {
  const items = $$('[data-count]');
  if (!items.length) return;
  const locale = isMr ? 'mr-IN' : 'en-IN';
  const run = (el: HTMLElement) => {
    const target = Number(el.dataset.count);
    const prefix = el.dataset.prefix ?? '';
    const suffix = el.dataset.suffix ?? '';
    const plain = el.dataset.plain === 'true';
    const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: !plain });
    if (reduced) {
      el.textContent = `${prefix}${fmt.format(target)}${suffix}`;
      return;
    }
    const start = performance.now();
    const from = Number(el.dataset.from ?? (plain ? Math.max(target - 40, 0) : 0));
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1800);
      const eased = 1 - (1 - p) ** 4;
      el.textContent = `${prefix}${fmt.format(Math.round(from + (target - from) * eased))}${suffix}`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          run(e.target as HTMLElement);
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.5 },
  );
  items.forEach((el) => io.observe(el));
}

const menuDialog = () => $<HTMLDialogElement>('dialog[data-menu]');

function initHeader() {
  const header = $('[data-header]');
  const toTop = $('[data-to-top]');
  let last = window.scrollY;
  let ticking = false;
  const update = () => {
    const y = window.scrollY;
    const focused = header?.contains(document.activeElement);
    if (header) {
      header.classList.toggle('is-scrolled', y > 40);
      if (y > 560 && y > last + 4 && !menuDialog()?.open && !focused) header.classList.add('is-hidden');
      else if (y < last - 4 || y < 560) header.classList.remove('is-hidden');
    }
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, y / max) : 0;
    document.documentElement.style.setProperty('--progress', progress.toFixed(4));
    if (toTop) {
      toTop.classList.toggle('is-visible', y > 700);
      toTop.style.setProperty('--ring', String(100 - progress * 100));
    }
    last = y;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    },
    { passive: true },
  );
  document.addEventListener('focusin', () => header?.classList.remove('is-hidden'));
  toTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    $('#main')?.focus({ preventScroll: true });
  });
  update();

  // Keep query and hash when switching language.
  $$<HTMLAnchorElement>('[data-lang-switch]').forEach((sw) => (sw.href = sw.getAttribute('href')! + location.search + location.hash));
}

let closeMenu = (_instant = false) => {};

function initMenu() {
  const dialog = menuDialog();
  const opener = $('[data-menu-open]');
  if (!dialog || !opener) return;
  const root = document.documentElement;
  const open = () => {
    if (dialog.open) return;
    dialog.showModal();
    root.classList.add('menu-open');
    opener.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('is-open')));
  };
  closeMenu = (instant = false) => {
    if (!dialog.open) return;
    opener.setAttribute('aria-expanded', 'false');
    const done = () => {
      dialog.classList.remove('is-closing', 'is-open');
      if (dialog.open) dialog.close();
      root.classList.remove('menu-open');
    };
    if (instant || reduced) return done();
    if (dialog.classList.contains('is-closing')) return;
    dialog.classList.remove('is-open');
    dialog.classList.add('is-closing');
    window.setTimeout(done, 620);
  };
  opener.addEventListener('click', open);
  $('[data-menu-close]', dialog)?.addEventListener('click', () => closeMenu());
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeMenu();
  });
  dialog.addEventListener('close', () => opener.focus({ preventScroll: true }));
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) closeMenu(true);
  });
}

function initClock() {
  const els = $$('[data-clock]');
  if (!els.length) return;
  const fmt = new Intl.DateTimeFormat(isMr ? 'mr-IN-u-nu-deva' : 'en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const tick = () => {
    const s = fmt.format(new Date());
    els.forEach((el) => (el.textContent = s));
  };
  tick();
  window.setInterval(tick, 1000);
}

/** Text roll on hover: wraps a link's own text in two stacked copies. */
function initRoll() {
  $$('.btn, .tlink, [data-roll]').forEach((el) => {
    if (el.querySelector('.roll')) return;
    Array.from(el.childNodes).forEach((n) => {
      const raw = n.textContent ?? '';
      if (n.nodeType !== Node.TEXT_NODE || !raw.trim()) return;
      const text = raw.trim();
      const roll = document.createElement('span');
      roll.className = 'roll';
      const a = document.createElement('span');
      a.textContent = text;
      const b = document.createElement('span');
      b.textContent = text;
      b.setAttribute('aria-hidden', 'true');
      roll.append(a, b);
      const parts: Node[] = [];
      if (/^\s/.test(raw)) parts.push(document.createTextNode(' '));
      parts.push(roll);
      if (/\s$/.test(raw)) parts.push(document.createTextNode(' '));
      n.replaceWith(...parts);
    });
  });
}

/** A floating preview that trails the pointer across a list ([data-follow]). */
function initFollow() {
  if (reduced || !finePointer) return;
  $$('[data-follow]').forEach((wrap) => {
    const box = $('[data-follow-box]', wrap);
    if (!box) return;
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    const loop = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      box.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.4 ? requestAnimationFrame(loop) : 0;
    };
    wrap.addEventListener('pointermove', (e) => {
      const r = wrap.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!wrap.classList.contains('is-following')) {
        x = tx;
        y = ty;
      }
      if (!raf) raf = requestAnimationFrame(loop);
    });
    $$('[data-follow-item]', wrap).forEach((item, i) => {
      item.addEventListener('pointerenter', () => {
        box.style.setProperty('--show', String(i));
        wrap.classList.add('is-following');
      });
    });
    wrap.addEventListener('pointerleave', () => wrap.classList.remove('is-following'));
  });
}

function initMagnetic() {
  if (reduced || !finePointer) return;
  $$('[data-magnetic]').forEach((el) => {
    el.style.transition += ', translate 0.45s cubic-bezier(.34,1.56,.64,1)';
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * 0.22;
      const y = (e.clientY - (r.top + r.height / 2)) * 0.3;
      el.style.translate = `${Math.max(-10, Math.min(10, x))}px ${Math.max(-8, Math.min(8, y))}px`;
    });
    el.addEventListener('pointerleave', () => (el.style.translate = ''));
  });
}

function initVideo() {
  $$('[data-video]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.video!;
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      frame.title = btn.getAttribute('aria-label') ?? 'Video';
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      frame.allowFullscreen = true;
      btn.replaceChildren(frame);
    });
  });
}

function initSearchLauncher() {
  const dialog = $<HTMLDialogElement>('dialog[data-search]');
  if (!dialog) return;
  let loaded: Promise<unknown> | null = null;
  const open = () => {
    loaded ??= import('./search').then((m) => m.setupSearch(dialog));
    closeMenu(true);
    dialog.showModal();
    $<HTMLInputElement>('[data-search-input]', dialog)?.select();
  };
  $$('[data-search-open]').forEach((b) => b.addEventListener('click', open));
  document.addEventListener('keydown', (e) => {
    const typing = (e.target as Element).closest('input, textarea, select, [contenteditable]');
    if (((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      if (!dialog.open) open();
    }
  });
}

initRoll();
initReveal();
initScroll();
initCounters();
initHeader();
initMenu();
initClock();
initFollow();
initMagnetic();
initVideo();
initSearchLauncher();

export {};
