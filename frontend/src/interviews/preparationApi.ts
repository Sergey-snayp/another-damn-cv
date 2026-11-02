export const INTERVIEW_TYPE_LABELS = {
  recruiter_screen: 'HR / recruiter screening',
  technical_screen: 'Technical screening',
  coding: 'Coding interview',
  system_design: 'System design',
  behavioural: 'Behavioural interview',
  hiring_manager: 'Hiring manager',
  final: 'Final interview',
  other: 'Other',
} as const;
export type InterviewType = keyof typeof INTERVIEW_TYPE_LABELS;
export interface PreparationInput {
  interviewType: InterviewType | null;
  interviewer: string;
  instructions: string;
  notes: string;
  questions: string;
}
export interface Preparation extends PreparationInput {
  jobId: string;
  updatedAt: string | null;
}
export function preparationValues(row: Preparation): PreparationInput {
  return { interviewType: row.interviewType, interviewer: row.interviewer, instructions: row.instructions, notes: row.notes, questions: row.questions };
}
export function isPreparationInput(value: unknown): value is PreparationInput {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (row.interviewType === null || (typeof row.interviewType === 'string' && Object.hasOwn(INTERVIEW_TYPE_LABELS, row.interviewType)))
    && ['interviewer', 'instructions', 'notes', 'questions'].every((key) => typeof row[key] === 'string');
}
async function request<T>(id: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}/preparation`, {
    credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message ?? `Could not load preparation (${response.status}).`);
  }
  return response.json() as Promise<T>;
}
export const preparationApi = {
  read: (id: string) => request<Preparation>(id),
  save: (id: string, input: PreparationInput) => request<Preparation>(id, { method: 'PUT', body: JSON.stringify(input) }),
};
