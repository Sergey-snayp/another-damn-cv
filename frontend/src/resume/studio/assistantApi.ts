/** The CV editor's right column: Resume Score, Chat and AI Settings, all kept on the server. */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

/** A job from the tracker, or a title and description typed in. */
export type JobChoice = { jobId: string } | { title?: string; description: string };

export type IssueSection = 'header' | 'summary' | 'experience' | 'projects' | 'education' | 'certifications' | 'skills';

export interface ResumeIssue {
  section: IssueSection;
  kind: 'keyword' | 'content' | 'format';
  message: string;
  lineageId?: string;
}

export interface ResumeScore {
  score: number | null;
  keywords: { score: number; matched: string[]; missing: string[] } | null;
  issues: ResumeIssue[];
  job: { id: string | null; title: string; company: string | null };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatSuggestion {
  target: 'summary' | 'headline' | 'bullet' | 'add-skill';
  lineageId?: string;
  where: string;
  before: string;
  after: string;
  reason: string;
}

export interface AiSettings {
  tone: 'balanced' | 'confident' | 'concise';
  instructions: string;
}

export interface JobAssessment {
  verdict: 'apply' | 'stretch' | 'skip' | 'unclear';
  /** 0 to 10, inside the verdict's band; null when unclear. */
  score: number | null;
  summary: string;
  strengths: Array<{ point: string; jobQuote: string; profileQuote: string }>;
  gaps: Array<{ point: string; jobQuote: string; importance: 'required' | 'preferred' }>;
  questions: string[];
  /** The posting's technologies; inProfile is checked by the server against the Profile text. */
  technologies?: Array<{ name: string; inProfile: boolean }>;
  basis: { source: 'profile'; profileRevision: number; jobId: string };
}

const path = (id: string) => `/resumes/${encodeURIComponent(id)}`;

export const assistantApi = {
  assessJob: (jobId: string) =>
    request<JobAssessment>('/profile/job-assessment', { method: 'POST', body: JSON.stringify({ jobId }) }),
  score: (id: string, job: JobChoice) =>
    request<ResumeScore>(`${path(id)}/score`, { method: 'POST', body: JSON.stringify(job) }),
  chat: (id: string, messages: ChatMessage[], job?: JobChoice) =>
    request<{ reply: string; suggestions: ChatSuggestion[] }>(`${path(id)}/chat`, {
      method: 'POST',
      body: JSON.stringify({ messages, ...(job ? { job } : {}) }),
    }),
  settings: (id: string) => request<AiSettings>(`${path(id)}/ai-settings`),
  saveSettings: (id: string, settings: AiSettings) =>
    request<AiSettings>(`${path(id)}/ai-settings`, { method: 'PUT', body: JSON.stringify(settings) }),
};
