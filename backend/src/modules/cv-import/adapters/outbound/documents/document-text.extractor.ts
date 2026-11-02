import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { CvImportError } from '../../../application/errors';
import type { DocumentTextExtractor } from '../../../application/ports/cv-import';

export class CvDocumentTextExtractor implements DocumentTextExtractor {
  async extract(bytes: Uint8Array, filename: string): Promise<string> {
    const buffer = Buffer.from(bytes);
    const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
    if (ext === 'pdf') return this.fromPdf(buffer);
    if (ext === 'docx') return clean((await mammoth.extractRawText({ buffer })).value);
    if (['txt', 'md'].includes(ext)) return clean(buffer.toString('utf8'));
    throw new CvImportError(`Unsupported file type ".${ext}". Send a PDF, DOCX or TXT.`);
  }

  private async fromPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const { text } = await parser.getText();
      const cleaned = clean(text);
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
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/-\n(?=[a-z])/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
