/** Cover letters for saved jobs: written by the AI from a CV, kept on the server, one per job. */

export interface LetterAuthor {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
}

export interface CoverLetter {
  jobId: string;
  resumeId: string | null;
  text: string;
  fileName: string;
  updatedAt: string;
}

export interface ListedCoverLetter extends CoverLetter {
  job: { title: string | null; company: string | null };
  author: LetterAuthor | null;
}

export interface CoverLetterDetail {
  letter: CoverLetter | null;
  author: LetterAuthor | null;
  job: { id: string; title: string | null; company: string | null };
}

/** A new letter, with what it could not claim and what to check. */
export interface WrittenCoverLetter extends CoverLetter {
  cannotClaim: string[];
  warnings: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/cover-letters${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message = Array.isArray(detail?.message) ? detail.message.join(' ') : detail?.message;
    throw new Error(message ?? `${response.status} ${response.statusText}`);
  }
  return (response.status === 204 ? undefined : response.json()) as Promise<T>;
}

export const coverLetterApi = {
  list: () => request<ListedCoverLetter[]>('', { cache: 'no-store' }),
  detail: (jobId: string) => request<CoverLetterDetail>(`/${encodeURIComponent(jobId)}`, { cache: 'no-store' }),
  generate: (jobId: string, resumeId: string, instruction?: string) =>
    request<WrittenCoverLetter>(`/${encodeURIComponent(jobId)}`, {
      method: 'POST',
      body: JSON.stringify({ resumeId, ...(instruction?.trim() ? { instruction: instruction.trim().slice(0, 500) } : {}) }),
    }),
  update: (jobId: string, text: string) =>
    request<CoverLetter>(`/${encodeURIComponent(jobId)}`, { method: 'PUT', body: JSON.stringify({ text }) }),
  remove: (jobId: string) => request<void>(`/${encodeURIComponent(jobId)}`, { method: 'DELETE' }),
  /** Opens in the browser's PDF viewer. */
  pdfUrl: (jobId: string) => `/api/cover-letters/${encodeURIComponent(jobId)}/pdf`,
};

/** "Pay & Co · Senior Backend Engineer" */
export function letterTitle(job: { title: string | null; company: string | null }): string {
  return [job.company, job.title].filter(Boolean).join(' · ') || 'Cover letter';
}
