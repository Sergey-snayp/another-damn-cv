import { missingFields, type ImportProposal } from '../../domain/import-proposal';
import { marksOnlyInText } from '../../domain/import-marks';
import type { CvTranscriber, DocumentTextExtractor, ProposalIdGenerator } from '../ports/cv-import';

/** Returns a draft for review. Import never writes profile or resume content. */
export class ImportCv {
  constructor(
    private readonly documents: DocumentTextExtractor,
    private readonly transcriber: CvTranscriber,
    private readonly ids: ProposalIdGenerator,
  ) {}
  async execute(input: { bytes: Uint8Array; filename: string }): Promise<ImportProposal> {
    const text = await this.documents.extract(input.bytes, input.filename);
    // Formatting read from the file stays in the summary, descriptions and bullets only.
    const proposed = marksOnlyInText(await this.transcriber.transcribe(text));
    return { id: this.ids.next(), proposed, charsRead: text.length, notFound: missingFields(proposed) };
  }
}
