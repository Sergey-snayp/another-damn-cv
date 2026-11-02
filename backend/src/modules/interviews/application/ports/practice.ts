import type { PracticeContext, PracticeKind, PracticeContent, PracticeRecord } from '../../domain/practice';

export interface PracticeContextReader {
  read(userId: string, jobId: string): Promise<PracticeContext>;
}
export interface PracticeRepository {
  list(userId: string, jobId: string): Promise<PracticeRecord[]>;
  save(userId: string, record: PracticeRecord): Promise<PracticeRecord>;
}
/** Implement this port with an API adapter later; prompts, storage and use cases stay independent. */
export interface PracticeGenerator {
  readonly identity: { provider: string; model: string };
  generate(kind: PracticeKind, context: PracticeContext): Promise<PracticeContent>;
}
export interface PracticeFingerprint {
  hash(value: string): string;
}
