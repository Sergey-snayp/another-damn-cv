/** One line of prose, with its spacing collapsed. */
export function tidyLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Quotes, dashes and spacing: a rewrite that changed only these changed nothing. */
export function sameWords(a: string, b: string): boolean {
  const plain = (t: string) =>
    t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  return plain(a) === plain(b);
}

export function blockedNote(problems: string[], where: string): string {
  return `Kept the original: the rewrite mentioned ${problems.slice(0, 5).join(', ')}, which ${where} does not contain.`;
}
