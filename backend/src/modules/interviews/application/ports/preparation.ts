import type { Preparation, PreparationInput } from '../../domain/preparation';
export interface PreparationJobReader {
  assertOwned(userId: string, jobId: string): Promise<void>;
}
export interface PreparationRepository {
  read(userId: string, jobId: string): Promise<Preparation | null>;
  save(userId: string, jobId: string, input: PreparationInput): Promise<Preparation>;
}
