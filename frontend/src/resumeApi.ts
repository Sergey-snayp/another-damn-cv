/**
 * The versioned resume API.
 *
 * Reads come from the materialised projection — one row, no joins. Writes go
 * through save(), which creates a snapshot only if something actually changed.
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

  return response.json() as Promise<T>;
}

// ── shapes returned by the API ───────────────────────────────────────────────

export interface Contact {
  lineageId?: string;
  firstName: string;
  lastName: string;
  email: string;
  /** One line under the name, such as "Senior Backend Engineer". */
  headline?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin?: string | null;
  github?: string | null;
  website?: string | null;
}

export interface Achievement {
  lineageId?: string;
  experienceLineageId: string;
  bullet: string;
  problem?: string | null;
  action?: string | null;
  result?: string | null;
  verified?: boolean;
  evidence?: string | null;
  weight?: number;
  position?: number;
}

export interface Experience {
  lineageId?: string;
  company: string;
  client?: string | null;
  title: string;
  location?: string | null;
  from: string;
  to?: string | null;
  current?: boolean;
  blurb?: string | null;
  position?: number;
  achievements: Achievement[];
}

export interface Education {
  lineageId?: string;
  institution: string;
  degree: string;
  field?: string | null;
  from: string;
  to?: string | null;
  position?: number;
}

export interface Skill {
  lineageId?: string;
  name: string;
  category?: string;
  level?: string | null;
  years?: number | null;
  verified?: boolean;
  evidence?: string | null;
  weight?: number;
  position?: number;
}

export interface Project {
  lineageId?: string;
  name: string;
  role?: string | null;
  link?: string | null;
  from?: string | null;
  to?: string | null;
  current?: boolean;
  bullets: string[];
  position?: number;
}

export interface Certification {
  lineageId?: string;
  name: string;
  issuer?: string | null;
  date?: string | null;
  link?: string | null;
  position?: number;
}

/** A section the person names, such as "Languages": text, bullets or both. */
export interface CustomSection {
  lineageId?: string;
  title: string;
  text?: string | null;
  bullets: string[];
  position?: number;
}

export interface RenderedResume {
  snapshot: number;
  contact: Contact | null;
  experiences: Experience[];
  educations: Education[];
  skills: Skill[];
  summaries: Record<string, string>;
  /** Missing on CVs saved before these sections existed. */
  projects?: Project[];
  certifications?: Certification[];
  customSections?: CustomSection[];
}

export interface ResumeSummary {
  id: string;
  name: string;
  targetRole: string | null;
  isPrimary: boolean;
  currentSnapshotId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set on a copy made by "Tailor resume for this job". */
  jobId: string | null;
  /** Keeps generated copies identifiable after their job is deleted. */
  sourceResumeId: string | null;
  /** Tailoring suggestions are waiting for review. */
  hasTailoring: boolean;
}

// ── tailoring ────────────────────────────────────────────────────────────────

export interface BulletSuggestion {
  lineageId: string;
  experienceLineageId: string;
  before: string;
  after: string;
  keep: boolean;
  reason: string | null;
  blocked: string | null;
  from: number;
  to: number;
}

export interface Tailoring {
  jobId: string;
  jobTitle: string;
  company: string | null;
  basedOnSnapshot: number;
  createdAt: string;
  summaryVariant: string;
  summary: { before: string; after: string; blocked: string | null };
  bullets: BulletSuggestion[];
  skills: string[];
  cannotClaim: string[];
}

export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface Change {
  section: string;
  table: string;
  lineageId: string;
  kind: 'added' | 'changed' | 'removed';
  label: string;
  fields: FieldChange[];
  before: Record<string, unknown> | null;
}

export interface SnapshotDiff {
  number: number;
  message: string | null;
  createdAt: string | null;
  changes: Change[];
  counts: { added: number; changed: number; removed: number };
}

export interface Snapshot {
  id: string;
  number: number;
  message: string | null;
  createdAt: string;
}

// ── the calls ────────────────────────────────────────────────────────────────

export const resumeApi = {
  list: () => request<ResumeSummary[]>('/resumes'),

  create: (name: string, targetRole?: string) =>
    request<ResumeSummary>('/resumes', {
      method: 'POST',
      body: JSON.stringify({ name, targetRole }),
    }),

  read: (id: string) => request<RenderedResume>(`/resumes/${id}`),

  /**
   * Achievements arrive nested under their role but must be sent FLAT with an
   * experienceLineageId — the server stores them in their own table.
   */
  save: (id: string, resume: RenderedResume, message?: string) =>
    request<RenderedResume>(`/resumes/${id}/save`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        contact: resume.contact ?? undefined,
        experiences: resume.experiences.map(({ achievements, ...rest }) => rest),
        achievements: resume.experiences.flatMap((experience) =>
          experience.achievements.map((achievement) => ({
            ...achievement,
            experienceLineageId: experience.lineageId ?? achievement.experienceLineageId,
          }))),
        educations: resume.educations,
        skills: resume.skills,
        summaries: Object.entries(resume.summaries).map(([variant, text]) => ({ variant, text })),
        projects: resume.projects ?? [],
        certifications: resume.certifications ?? [],
        customSections: resume.customSections ?? [],
      }),
    }),

  snapshots: (id: string) => request<Snapshot[]>(`/resumes/${id}/snapshots`),
  diff: (id: string, number: number) => request<SnapshotDiff>(`/resumes/${id}/diff/${number}`),
  at: (id: string, number: number) => request<RenderedResume>(`/resumes/${id}/at/${number}`),
  revert: (id: string, number: number) =>
    request<RenderedResume>(`/resumes/${id}/revert/${number}`, { method: 'POST' }),

  tailoring: (id: string) => request<{ tailoring: Tailoring | null }>(`/resumes/${id}/tailoring`),
  discardTailoring: (id: string) =>
    fetch(`/api/resumes/${id}/tailoring`, { method: 'DELETE', credentials: 'include' }).then(() => undefined),

  history: (id: string, table: string, lineageId: string) =>
    request<Record<string, unknown>[]>(
      `/resumes/${id}/history?table=${table}&lineageId=${encodeURIComponent(lineageId)}`),
};
