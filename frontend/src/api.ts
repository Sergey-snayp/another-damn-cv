/**
 * All calls go through the Vite proxy, so the browser sees one origin and the
 * session cookie is sent without any CORS negotiation.
 *
 * `credentials: 'include'` is essential — without it the cookie is dropped and
 * every authenticated request looks signed-out.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Not signed in');
    this.name = 'UnauthorizedError';
  }
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface AuthConfig {
  googleClientId: string;
  configured: boolean;
}

export interface FactBaseStats {
  skills: number;
  skillsVerified: number;
  projects: number;
  achievements: number;
  achievementsVerified: number;
}

export interface ExperienceEntry {
  id: string;
  company: string;
  title: string;
  location?: string;
  from: string;
  to: string;
  current: boolean;
  description?: string;
}

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  field: string;
  from: string;
  to: string;
}

export interface CandidateProfile {
  firstName: string; lastName: string; fullName: string; preferredName: string;
  email: string; phone: string;
  location: string; city: string; state: string; country: string; postalCode: string;
  linkedin: string; github: string; portfolio: string; website: string;
  currentCompany: string; currentTitle: string; yearsExperience: string;
  workAuthorization: string; requiresSponsorship: string;
  salaryExpectation: string; noticePeriod: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
}

export interface ImportProposal {
  id: string;
  proposed: Partial<CandidateProfile>;
  charsRead: number;
  notFound: string[];
}

/**
 * Uploads are their own path: FormData must NOT carry a Content-Type header,
 * because the browser has to set the multipart boundary itself.
 */
async function upload<T>(path: string, file: File): Promise<T> {
  const body = new FormData();
  body.append('file', file);

  const response = await fetch(`/api${path}`, { method: 'POST', credentials: 'include', body });

  if (response.status === 401) throw new UnauthorizedError();

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.message ?? `${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  url?: string;
  appliedAt: string;
  status: string;
  claimed: string[];
  notClaimed: string[];
}

export const api = {
  applications: () => request<ApplicationRecord[]>('/applications'),
  importCv: (file: File) => upload<ImportProposal>('/import/cv', file),
  profile: () => request<CandidateProfile>('/profile'),
  saveProfile: (profile: Partial<CandidateProfile>) =>
    request<CandidateProfile>('/profile', { method: 'PUT', body: JSON.stringify(profile) }),
  syncToken: () => request<{ token: string | null }>('/profile/sync-token'),
  rotateSyncToken: () =>
    request<{ token: string }>('/profile/sync-token', { method: 'POST' }),
  authConfig: () => request<AuthConfig>('/auth/config'),
  me: () => request<CurrentUser>('/auth/me'),
  signInWithGoogle: (credential: string) =>
    request<CurrentUser>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  stats: () => request<FactBaseStats>('/factbase/stats'),
};
