import type { SavedAnswer } from '../../domain/answers';

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
  markUsed(userId: string, ids: string[]): Promise<void>;
}
