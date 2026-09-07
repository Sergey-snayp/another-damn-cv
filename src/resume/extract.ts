import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export type ResumeKind = 'pdf' | 'docx' | 'text';
export interface Extracted { text: string; kind: ResumeKind }

/** PDF text arrives with ragged spacing and hyphenated line breaks; normalize it. */
const clean = (s: string): string =>
  s.replace(/\r\n?/g, '\n')
   .replace(/-\n(?=[a-z])/g, '')       // re-join words split across lines
   .replace(/[ \t]+/g, ' ')
   .replace(/\n{3,}/g, '\n\n')
   .split('\n').map((l) => l.trim()).join('\n')
   .trim();

/**
 * Pull plain text out of an uploaded resume. Deliberately format-agnostic:
 * whatever the user has to hand is what they will send.
 */
export async function extractResume(buf: Buffer, filename: string): Promise<Extracted> {
  const ext = (filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) ?? '';

  if (ext === 'pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const { text } = await parser.getText();
      const out = clean(text);
      if (out.length < 200) {
        throw new Error(
          'That PDF has almost no extractable text — it is probably a scan or an image. ' +
          'Send the DOCX, or export a text-based PDF.');
      }
      return { text: out, kind: 'pdf' };
    } finally {
      await parser.destroy();
    }
  }

  if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: clean(value), kind: 'docx' };
  }

  if (ext === 'txt' || ext === 'md' || ext === 'yaml' || ext === 'yml') {
    return { text: clean(buf.toString('utf8')), kind: 'text' };
  }

  throw new Error(`Unsupported file type ".${ext}". Send a PDF, DOCX, TXT or MD.`);
}
