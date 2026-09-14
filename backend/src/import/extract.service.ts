import { BadRequestException, Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/** Plain text out of whatever the user has to hand. */
@Injectable()
export class ExtractService {
  async fromFile(buffer: Buffer, filename: string): Promise<string> {
    const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';

    if (ext === 'pdf') return this.fromPdf(buffer);
    if (ext === 'docx') return this.clean((await mammoth.extractRawText({ buffer })).value);
    if (['txt', 'md'].includes(ext)) return this.clean(buffer.toString('utf8'));

    throw new BadRequestException(`Unsupported file type ".${ext}". Send a PDF, DOCX or TXT.`);
  }

  private async fromPdf(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });

    try {
      const { text } = await parser.getText();
      const cleaned = this.clean(text);

      if (cleaned.length < 200) {
        throw new BadRequestException(
          'That PDF has almost no extractable text — it is probably a scan. '
          + 'Send the DOCX, or export a text-based PDF.');
      }

      return cleaned;
    } finally {
      await parser.destroy();
    }
  }

  /** PDF text arrives with ragged spacing and words split across lines. */
  private clean(text: string): string {
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/-\n(?=[a-z])/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n').map((line) => line.trim()).join('\n')
      .trim();
  }
}
