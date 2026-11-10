/**
 * Formatting kept inside plain text, so every field stays a string:
 *   **bold**   *italic*   ++underline++   [text](https://link)   "- " at a line's start for a list.
 * Bold is what CVs already used; the rest are added the same way.
 */

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  href?: string;
}

const INLINE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|\*\*(.+?)\*\*|\+\+(.+?)\+\+|(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g;

/** One line's spans; marks may nest one inside another ("**[site](https://a.b)**"). */
export function spansOf(line: string, style: Omit<Span, "text"> = {}): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE)) {
    if (match.index! > last) out.push({ text: line.slice(last, match.index), ...style });
    if (match[1] !== undefined) out.push(...spansOf(match[1], { ...style, href: match[2] }));
    else if (match[3] !== undefined) out.push(...spansOf(match[3], { ...style, bold: true }));
    else if (match[4] !== undefined) out.push(...spansOf(match[4], { ...style, underline: true }));
    else out.push(...spansOf(match[5]!, { ...style, italic: true }));
    last = match.index! + match[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), ...style });
  return out;
}

/** Lines of a text: list items (a "- " line) and paragraphs. */
export function blocksOf(text: string): { list: boolean; lines: string[] }[] {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const item = /^\s*[-•]\s+(.*)$/.exec(raw);
    const list = Boolean(item);
    const line = item ? item[1]! : raw;
    const previous = blocks[blocks.length - 1];
    if (previous && previous.list && list) previous.lines.push(line);
    else blocks.push({ list, lines: [line] });
  }
  return blocks;
}

/** The words alone: for checks, counts, search and the AI. */
export const withoutMarks = (text: string) =>
  spansOf(text.replace(/^\s*[-•]\s+/gm, ""))
    .map((span) => span.text)
    .join("");

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A span as HTML: <b>, <i>, <u>, <a>. */
export function spanHtml(span: Span, inner = escapeHtml(span.text)): string {
  let html = inner;
  if (span.href) html = `<a href="${escapeHtml(span.href)}">${html}</a>`;
  if (span.underline) html = `<u>${html}</u>`;
  if (span.italic) html = `<i>${html}</i>`;
  if (span.bold) html = `<b>${html}</b>`;
  return html;
}

/** The text as HTML for an editor: paragraphs as lines, "- " lines as a list. */
export function marksToHtml(text: string): string {
  return blocksOf(text)
    .map((block) => {
      const lines = block.lines.map((line) => spansOf(line).map((span) => spanHtml(span)).join(""));
      return block.list ? `<ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul>` : lines.map((line) => `<div>${line || "<br>"}</div>`).join("");
    })
    .join("");
}

/** Marks around a piece of text, outermost first, as an editor's element sets them. */
function wrap(element: Element, inner: string): string {
  if (!inner.trim()) return inner;
  const tag = element.tagName;
  const style = element instanceof HTMLElement ? element.style : null;
  let out = inner;
  if (tag === "A" && element.getAttribute("href")) out = `[${out}](${element.getAttribute("href")})`;
  if (tag === "U" || style?.textDecorationLine.includes("underline")) out = `++${out}++`;
  if (tag === "I" || tag === "EM" || style?.fontStyle === "italic") out = `*${out}*`;
  if (tag === "B" || tag === "STRONG" || style?.fontWeight === "bold" || Number(style?.fontWeight) >= 600) out = `**${out}**`;
  return out;
}

/**
 * An edited element back to text with marks. Lines come from <div>, <p>, <br>
 * and list items; elements marked data-auto (bold the CV adds by itself) are plain.
 */
export function htmlToMarks(root: Node): string {
  const lines: string[] = [];
  let current = "";
  const flush = () => {
    lines.push(current);
    current = "";
  };
  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof Element)) return "";
    if (node.tagName === "BR") return "\n";
    const inner = [...node.childNodes].map(inline).join("");
    return node.hasAttribute("data-auto") ? inner : wrap(node, inner);
  };
  const walk = (node: Node) => {
    if (node instanceof Element && (node.tagName === "UL" || node.tagName === "OL")) {
      if (current) flush();
      for (const item of node.children) {
        current = `- ${inline(item).replace(/\n/g, " ").trim()}`;
        flush();
      }
      return;
    }
    if (node instanceof Element && (node.tagName === "DIV" || node.tagName === "P")) {
      if (current) flush();
      for (const child of node.childNodes) walk(child);
      flush();
      return;
    }
    const text = inline(node);
    const parts = text.split("\n");
    current += parts[0];
    for (const part of parts.slice(1)) {
      flush();
      current = part;
    }
  };
  root.childNodes.forEach(walk);
  if (current) flush();
  return lines
    .map((line) => line.replace(/ /g, " ").replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Bold kept, the other marks taken off: for the change view, which shows bold only. */
export const boldOnly = (text: string) =>
  spansOf(text)
    .map((span) => (span.bold ? `**${span.text}**` : span.text))
    .join("");
