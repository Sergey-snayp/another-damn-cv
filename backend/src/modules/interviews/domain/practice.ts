import type { InterviewType } from './preparation';

export const PRACTICE_KINDS = ['hr', 'technical'] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];
export const PRACTICE_PROMPT_VERSION = 'interview-practice-v1';

export interface PracticeEvidence {
  id: string;
  source: 'cv' | 'preparation';
  label: string;
  text: string;
}
export interface PracticeContext {
  job: { title: string; company: string; description: string; salary: string | null };
  cv: { id: string; snapshot: number } | null;
  interviewType: InterviewType | null;
  evidence: PracticeEvidence[];
}
export interface PracticeQuestion {
  question: string;
  why: string;
  answerKind: 'personal' | 'conceptual';
  answer: string;
  talkingPoints: string[];
  followUps: string[];
  evidenceIds: string[];
  needsInput: string[];
}
export interface PracticeContent {
  questions: PracticeQuestion[];
}
export interface PracticeRecord extends PracticeContent {
  jobId: string;
  kind: PracticeKind;
  inputHash: string;
  promptVersion: string;
  provider: string;
  model: string;
  generatedAt: Date;
  cv: { id: string; snapshot: number };
  evidence: PracticeEvidence[];
}
export interface PracticeView extends PracticeRecord {
  stale: boolean;
}
export class PracticeError extends Error {
  constructor(
    readonly code: 'invalid' | 'busy' | 'unavailable' | 'invalid-output',
    message: string,
  ) {
    super(message);
  }
}

export function practiceProblems(context: PracticeContext): string[] {
  return [
    ...(!context.job.description.trim() ? ['Add a job description before generating questions.'] : []),
    ...(!context.cv ? ['Choose a saved application CV before generating personal answers.'] : []),
    ...(JSON.stringify(context).length > 60_000
      ? ['The saved context is too long. Shorten your preparation notes or choose a shorter CV.']
      : []),
  ];
}

/** Structural parsing lives in adapters. This rule checks references against the actual supplied facts. */
export function assertPracticeEvidence(content: PracticeContent, context: PracticeContext): void {
  const allowed = new Set(context.evidence.map((row) => row.id));
  for (const question of content.questions) {
    if (question.evidenceIds.some((id) => !allowed.has(id)))
      throw new PracticeError(
        'invalid-output',
        'The AI referenced information that was not supplied. Your previous answers are unchanged.',
      );
    if (question.answerKind === 'personal' && !question.evidenceIds.length && !question.needsInput.length)
      throw new PracticeError(
        'invalid-output',
        'A personal answer has no supporting source or question for you. Your previous answers are unchanged.',
      );
  }
}
