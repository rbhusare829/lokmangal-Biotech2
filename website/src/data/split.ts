/**
 * Text splitting for entrance animations. Works on short HTML strings that hold
 * only text and inline tags such as <em> and <br>, the way headings are written in this site.
 */

const eachTextPart = (html: string, fn: (text: string) => string) =>
  html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith('<') ? part : fn(part)))
    .join('');

/** Wraps every word in a mask so it can rise into place ([data-words] on a parent). */
export function maskWords(html: string, start = 0): string {
  let i = start;
  return eachTextPart(html, (text) => text.replace(/\S+/g, (w) => `<span class="w"><span style="--i:${i++}">${w}</span></span>`));
}

/** Wraps every word so it can slide in from the side ([data-slide] on a parent). */
export function slideWords(html: string, start = 0, dir: 1 | -1 = 1): string {
  let i = start;
  return eachTextPart(html, (text) => text.replace(/\S+/g, (w) => `<span class="sw" style="--i:${i++};--dir:${dir}">${w}</span>`));
}

/** Number of words in a short HTML string, for chaining delays across lines. */
export const wordCount = (html: string) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
