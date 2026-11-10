/**
 * Formatting kept inside plain text (the same marks the editors write; the resumes
 * module has the same reader for CV text, as domains do not import each other):
 *   **bold**   *italic*   ++underline++   [text](https://link)   "- " at a line's start for a list.
 * Checks, scores, comparisons and searches read the words alone.
 */
const INLINE =
  /\[([^\]\n]+)\]\((?:https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|\*\*(.+?)\*\*|\+\+(.+?)\+\+|(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g;

/** The words alone: marks, link addresses and list markers taken out. */
export function withoutMarks(text: string): string {
  let out = text.replace(/^\s*[-•]\s+/gm, '');
  // Marks may nest ("**[site](https://a.b)**"): take them off until none are left.
  for (let previous = ''; previous !== out; ) {
    previous = out;
    out = out.replace(
      INLINE,
      (_match, link?: string, bold?: string, underline?: string, italic?: string) =>
        link ?? bold ?? underline ?? italic ?? '',
    );
  }
  return out;
}
