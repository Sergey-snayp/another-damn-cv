/**
 * Saved jobs: sent from the extension, found by the scanner, or pasted here.
 */

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

  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export type JobStatus =
  | 'saved' | 'applied' | 'screening' | 'interview' | 'offer'
  | 'accepted' | 'rejected' | 'declined' | 'dismissed';

/** The board's columns, left to right. */
export const PIPELINE: JobStatus[] = ['saved', 'applied', 'screening', 'interview', 'offer'];
/** Where a job ends up. Shown on the board only when asked. */
export const CLOSED: JobStatus[] = ['accepted', 'rejected', 'declined'];
/** Every status, in the order a menu lists them. */
export const ALL_STATUSES: JobStatus[] = [...PIPELINE, ...CLOSED, 'dismissed'];

export const STATUS_LABELS: Record<JobStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  declined: 'Declined',
  dismissed: 'Dismissed',
};

export interface StatusEvent {
  id: string;
  from: JobStatus;
  to: JobStatus;
  at: string;
}
export type JobExtraction = 'pending' | 'structured' | 'llm' | 'manual' | 'failed';

export interface InterviewSchedule {
  date: string;
  time: string | null;
  timeZone: string;
}

export interface Job {
  id: string;
  source: 'extension' | 'scanner' | 'manual';
  status: JobStatus;
  extraction: JobExtraction;
  extractionError: string | null;
  url: string | null;
  title: string | null;
  company: string | null;
  /** The company's logo found on the page by the extension; null shows initials. */
  companyLogo: string | null;
  location: string | null;
  remote: boolean | null;
  employmentType: string | null;
  salary: string | null;
  postedAt: string | null;
  description: string | null;
  pageTitle: string | null;
  editedFields: string[];
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  archivedAt: string | null;
  appliedAt: string | null;
  applicationResumeId: string | null;
  applicationSnapshot: number | null;
  interview: InterviewSchedule | null;
}

/** One job with its moves, newest first. */
export type JobDetail = Job & { history: StatusEvent[] };

export type JobSummary = Omit<Job, 'description'> & { tailoredResumeId: string | null };

export type JobEdit = Partial<Pick<Job,
  'title' | 'company' | 'location' | 'remote' | 'employmentType' | 'salary' | 'description' | 'status' | 'interview'>>;

export interface ManualJob {
  description: string;
  title?: string;
  company?: string;
  location?: string;
  url?: string;
}

export interface ApplicationInput {
  title: string;
  company: string;
  location?: string;
  employmentType?: string;
  status?: JobStatus;
  resumeId?: string;
  resumeSnapshot?: number;
  url?: string;
  salary?: string;
  description?: string;
  addedAt?: string;
  appliedAt?: string;
  favorite?: boolean;
  archived?: boolean;
}

export const jobsApi = {
  attachResume: (id: string, resumeId: string | null) => request<Job>(`/jobs/applications/${id}/resume`, { method: 'PATCH', body: JSON.stringify({ resumeId }) }),
  addApplication: (application: ApplicationInput) => request<Job>('/jobs/applications', { method: 'POST', body: JSON.stringify(application) }),
  importApplications: (rows: ApplicationInput[]) => request<{ imported: number; skipped: number }>('/jobs/applications/import', { method: 'POST', body: JSON.stringify({ rows }) }),
  exportApplications: () => request<Job[]>('/jobs/applications/export'),
  preferences: (ids: string[], edit: { favorite?: boolean; archived?: boolean }) => request<Job[]>('/jobs/applications/preferences', { method: 'PATCH', body: JSON.stringify({ ids, ...edit }) }),
  list: (status?: JobStatus) => request<JobSummary[]>(`/jobs${status ? `?status=${status}` : ''}`),
  get: (id: string) => request<JobDetail>(`/jobs/${id}`),
  create: (job: ManualJob) => request<Job>('/jobs', { method: 'POST', body: JSON.stringify(job) }),
  update: (id: string, edit: JobEdit) =>
    request<JobDetail>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(edit) }),
  /** Reverts the job's latest move; refused if it has moved again since. */
  undoStatus: (id: string, eventId: string) =>
    request<JobDetail>(`/jobs/${id}/status/undo`, { method: 'POST', body: JSON.stringify({ eventId }) }),
  reread: (id: string) => request<JobDetail>(`/jobs/${id}/reread`, { method: 'POST' }),
  remove: (id: string) => request<void>(`/jobs/${id}`, { method: 'DELETE' }),
  /** Takes 1–3 minutes: the AI reads the whole resume against the posting. */
  tailor: (id: string, sourceResumeId?: string) =>
    request<{ resumeId: string }>(`/jobs/${id}/tailor`, {
      method: 'POST', body: JSON.stringify({ sourceResumeId }),
    }),
};

/** "Senior Engineer", or the page title while the reader is still working. */
export function jobName(job: Pick<Job, 'title' | 'pageTitle'>): string {
  return job.title ?? job.pageTitle ?? 'Untitled job';
}

export const EXTRACTION_LABELS: Record<JobExtraction, string> = {
  pending: 'reading…',
  structured: 'from page data',
  llm: 'read by AI',
  manual: 'entered by hand',
  failed: 'could not read',
};

export const SOURCE_LABELS: Record<Job['source'], string> = {
  extension: 'From the extension',
  scanner: 'Found by the scanner',
  manual: 'Pasted',
};
