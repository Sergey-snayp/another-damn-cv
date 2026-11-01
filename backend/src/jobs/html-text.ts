/**
 * Readable text out of the small, regular HTML that job data carries.
 *
 * JSON-LD descriptions are a handful of <p>, <ul>, <li> and <br> tags, often
 * entity-encoded once more on top. That is narrow enough for a few rules; a
 * whole web page is not, which is why the extension sends page text separately.
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  bull: '•',
  middot: '·',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const value =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

export function htmlToText(html: string): string {
  // Encoded markup ("&lt;p&gt;") is decoded first, so the tags below can see it.
  const source = /&lt;\/?[a-z]/i.test(html) && !/<\/?[a-z]/i.test(html) ? decodeEntities(html) : html;

  const text = source
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    // A closing </li> adds nothing: the next <li> already starts a new line.
    .replace(/<\/(p|div|ul|ol|h[1-6]|section|article|tr|table)>/gi, '\n')
    .replace(/<(p|div|ul|ol|h[1-6]|section|article|tr|table)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return tidy(decodeEntities(text));
}

/** Collapses the spacing that markup and innerText leave behind. */
export function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
