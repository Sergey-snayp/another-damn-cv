export type PracticeKind = 'hr' | 'technical';
export interface PracticeEvidence { id: string; source: 'cv' | 'preparation'; label: string; text: string }
export interface PracticeQuestion {
  question: string; why: string; answerKind: 'personal' | 'conceptual'; answer: string;
  talkingPoints: string[]; followUps: string[]; evidenceIds: string[]; needsInput: string[];
}
export interface PracticeResult {
  kind: PracticeKind; generatedAt: string; provider: string; model: string; stale: boolean;
  cv: { id: string; snapshot: number }; questions: PracticeQuestion[]; evidence: PracticeEvidence[];
}
export interface PracticeState { results: PracticeResult[]; problems: string[]; running: PracticeKind[] }
async function request<T>(jobId: string, suffix = '', init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/preparation/practice${suffix}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? `Could not load interview questions (${response.status}).`);
  }
  return response.json() as Promise<T>;
}
export const practiceApi = {
  read: (id: string) => request<PracticeState>(id),
  generate: (id: string, kind: PracticeKind, regenerate: boolean) => request<PracticeResult>(id, `/${kind}`, { method: 'POST', body: JSON.stringify({ regenerate }) }),
};
