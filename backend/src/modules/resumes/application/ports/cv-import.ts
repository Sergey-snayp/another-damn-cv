import type { ImportedProfile } from '../../domain/import-proposal';

export interface DocumentTextExtractor {
  extract(bytes: Uint8Array, filename: string): Promise<string>;
}

export interface CvTranscriber {
  transcribe(text: string): Promise<ImportedProfile>;
}

export interface ProposalIdGenerator {
  next(): string;
}
