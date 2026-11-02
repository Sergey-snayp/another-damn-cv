export const INTERVIEW_TYPES = [
  'recruiter_screen',
  'technical_screen',
  'coding',
  'system_design',
  'behavioural',
  'hiring_manager',
  'final',
  'other',
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];
export interface PreparationInput {
  interviewType: InterviewType | null;
  interviewer: string;
  instructions: string;
  notes: string;
  questions: string;
}
export interface Preparation extends PreparationInput {
  jobId: string;
  updatedAt: Date | null;
}
export function emptyPreparation(jobId: string): Preparation {
  return {
    jobId,
    interviewType: null,
    interviewer: '',
    instructions: '',
    notes: '',
    questions: '',
    updatedAt: null,
  };
}
export class PreparationNotFoundError extends Error {
  constructor() {
    super('No such job.');
  }
}
