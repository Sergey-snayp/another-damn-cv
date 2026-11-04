import type { SavedAnswer } from '../../domain/answers';
import type { CvEvidence, Draft, DraftContext } from '../../domain/drafts';

export interface NewAnswer {
  question: string;
  questionKey: string;
  answer: string;
  company: string | null;
}

export interface AnswerRepository {
  list(userId: string): Promise<SavedAnswer[]>;
  /** Insert or replace by question key, in one transaction. */
  upsertMany(userId: string, answers: NewAnswer[]): Promise<SavedAnswer[]>;
  update(userId: string, id: string, answer: string): Promise<SavedAnswer | null>;
  remove(userId: string, id: string): Promise<boolean>;
  /** Deletes the answer saved for this question key, if any. */
  removeByKey(userId: string, questionKey: string): Promise<boolean>;
  markUsed(userId: string, ids: string[]): Promise<void>;
}

export interface CvEvidenceReader {
  /** The CV's content without contact details. Throws DraftError cv-not-found for a CV the user does not own. */
  read(userId: string, resumeId: string): Promise<CvEvidence>;
}

export interface AnswerDrafter {
  draft(context: DraftContext): Promise<Draft>;
}
