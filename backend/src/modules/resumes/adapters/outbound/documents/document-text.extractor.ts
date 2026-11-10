import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { CvImportError } from '../../../application/cv-import-error';
import type { DocumentTextExtractor } from '../../../application/ports/cv-import';

export class CvDocumentTextExtractor implements DocumentTextExtractor {
  async extract(bytes: Uint8Array, filename: string): Promise<string> {
    const buffer = Buffer.from(bytes);
    const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
    if (ext === 'pdf') return this.fromPdf(buffer);
    if (ext === 'docx')
      return clean(htmlToMarks((await mammoth.convertToHtml({ buffer }, { styleMap: ['u => u'] })).value));
    if (['txt', 'md'].includes(ext)) return clean(buffer.toString('utf8'));
    throw new CvImportError(`Unsupported file type ".${ext}". Send a PDF, DOCX or TXT.`);
  }

  private async fromPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      // Links come back as [text](https://…); bold and italic are read from the fonts.
      const { text } = await parser.getText({ parseHyperlinks: true });
      const cleaned = clean(markStyles(text, await styledRuns(buffer)));
      if (cleaned.length < 200)
        throw new CvImportError(
          'That PDF has almost no extractable text — it is probably a scan. ' +
            'Send the DOCX, or export a text-based PDF.',
        );
      return cleaned;
    } finally {
      await parser.destroy();
    }
  }
}

function clean(text: string): string {
  return (
    text
      // Ligature characters ("ﬁ", "ﬂ") back to their letters.
      .normalize('NFKC')
      .replace(/\r\n?/g, '\n')
      .replace(/-\n(?=[a-z])/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim()
  );
}

/** A piece of a PDF's text and whether its font is bold or italic, in reading order. */
interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
}

interface PdfJs {
  getDocument(source: { data: Uint8Array; verbosity?: number }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getOperatorList(): Promise<unknown>;
        getTextContent(): Promise<{ items: { str?: string; fontName?: string }[] }>;
        commonObjs: { get(name: string): { name?: string } | undefined };
      }>;
      destroy(): Promise<void>;
    }>;
  };
}

/**
 * Every piece of text with its font's weight and slant. The font names say it
 * ("CharterBT-Bold", "Inter-SemiBoldItalic"). pdf-parse has loaded pdf.js, and
 * keeps it on globalThis; without it, the text is read without styles.
 */
async function styledRuns(buffer: Buffer): Promise<Run[]> {
  const pdfjs = (globalThis as { pdfjsLib?: PdfJs }).pdfjsLib;
  if (!pdfjs) return [];
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise;
    try {
      const runs: Run[] = [];
      for (let n = 1; n <= Math.min(doc.numPages, 10); n++) {
        const page = await doc.getPage(n);
        await page.getOperatorList();
        const fonts = new Map<string, string>();
        for (const item of (await page.getTextContent()).items) {
          if (!item.str?.trim() || !item.fontName) continue;
          if (!fonts.has(item.fontName)) {
            let name = '';
            try {
              name = page.commonObjs.get(item.fontName)?.name ?? '';
            } catch {
              name = '';
            }
            fonts.set(item.fontName, name);
          }
          const font = fonts.get(item.fontName) ?? '';
          runs.push({
            text: item.str,
            bold: /bold|black|heavy|semibold|demi/i.test(font),
            italic: /italic|oblique/i.test(font),
          });
        }
      }
      return runs;
    } finally {
      await doc.destroy();
    }
  } catch {
    return [];
  }
}

/**
 * The text with its bold and italic runs marked, found in order: a run the
 * text no longer has as written is left plain. Neighbouring runs join into one.
 */
export function markStyles(text: string, runs: Run[]): string {
  if (!runs.some((run) => run.bold || run.italic)) return text;
  let out = '';
  let cursor = 0;
  for (const run of runs) {
    const piece = run.text.trim();
    const at = text.indexOf(piece, cursor);
    if (at < 0 || at - cursor > 400) continue;
    out += text.slice(cursor, at);
    out += run.bold ? `**${piece}**` : run.italic ? `*${piece}*` : piece;
    cursor = at + piece.length;
  }
  out += text.slice(cursor);
  return (
    out
      // "**a** **b**" → "**a b**", "*a* *b*" → "*a b*", "**a****b**" → "**ab**".
      .replace(/\*\*\*\*/g, '')
      .replace(/([^*\s])\*\*([ \t]+)\*\*([^*\s])/g, '$1$2$3')
      .replace(/([^*\s])\*([ \t]+)\*([^*\s])/g, '$1$2$3')
  );
}

/** Word's HTML (from mammoth) as text with marks. */
export function htmlToMarks(html: string): string {
  return html
    .replace(
      /<a [^>]*href="((?:https?:|mailto:)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, inner: string) => `[${inner}](${href})`,
    )
    .replace(/<\/?(strong|b)>/gi, '**')
    .replace(/<\/?(em|i)>/gi, '*')
    .replace(/<\/?u>/gi, '++')
    .replace(/<li>/gi, '\n- ')
    .replace(/<\/(p|h[1-6]|tr)>/gi, '\n\n')
    .replace(/<\/li>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\*\*\*\*|\+\+\+\+/g, '');
}
