import type {
  Achievement,
  JobForCopy,
  RenderedResume,
  ResumeChanges,
  SectionRows,
  VersionedRow,
} from './resume';

export const BOOKKEEPING_COLUMNS = [
  'id',
  'resumeId',
  'lineageId',
  'createdInSnapshot',
  'supersededInSnapshot',
] as const;
export function withoutBookkeeping(row: object, keepLineage = false): Record<string, unknown> {
  const content = { ...row } as Record<string, unknown>;
  for (const column of BOOKKEEPING_COLUMNS)
    if (column !== 'lineageId' || !keepLineage) delete content[column];
  return content;
}
export function assemble(number: number, rows: SectionRows): RenderedResume {
  const byRole = new Map<string, Achievement[]>();
  for (const achievement of rows.achievements) {
    const list = byRole.get(achievement.experienceLineageId) ?? [];
    list.push(achievement);
    byRole.set(achievement.experienceLineageId, list);
  }
  return {
    snapshot: number,
    contact: rows.contact,
    experiences: rows.experiences.map((role) => ({
      ...role,
      achievements: byRole.get(role.lineageId) ?? [],
    })),
    educations: rows.educations,
    skills: rows.skills,
    summaries: Object.fromEntries(rows.summaries.map((summary) => [summary.variant, summary.text])),
    projects: rows.projects,
    certifications: rows.certifications,
    customSections: rows.customSections,
  };
}
export function toChanges(resume: RenderedResume): ResumeChanges {
  return {
    contact: resume.contact ? withoutBookkeeping(resume.contact, true) : undefined,
    experiences: resume.experiences.map(({ achievements: _bullets, ...role }) =>
      withoutBookkeeping(role, true),
    ),
    achievements: resume.experiences.flatMap((role) =>
      role.achievements.map((achievement) => withoutBookkeeping(achievement, true)),
    ),
    educations: resume.educations.map((entry) => withoutBookkeeping(entry, true)),
    skills: resume.skills.map((entry) => withoutBookkeeping(entry, true)),
    summaries: Object.entries(resume.summaries).map(([variant, text]) => ({ variant, text })),
    projects: resume.projects?.map((entry) => withoutBookkeeping(entry, true)),
    certifications: resume.certifications?.map((entry) => withoutBookkeeping(entry, true)),
    customSections: resume.customSections?.map((entry) => withoutBookkeeping(entry, true)),
  } as ResumeChanges;
}
export function differs(existing: VersionedRow, content: Record<string, unknown>): boolean {
  return Object.entries(content).some(
    ([column, value]) =>
      value !== undefined && JSON.stringify(existing[column] ?? null) !== JSON.stringify(value ?? null),
  );
}
export function copyOf(from: RenderedResume, generateId: () => string): ResumeChanges {
  return copyChanges(toChanges(from), generateId);
}

/** Fresh lineage for a new document, including an edited, unsaved draft. */
export function copyChanges(changes: ResumeChanges, generateId: () => string): ResumeChanges {
  const newId = new Map<string, string>();
  const fresh = (lineageId?: string) => {
    if (!lineageId) return generateId();
    const id = newId.get(lineageId) ?? generateId();
    newId.set(lineageId, id);
    return id;
  };
  return {
    contact: changes.contact && { ...changes.contact, lineageId: undefined },
    experiences: changes.experiences?.map((role) => ({ ...role, lineageId: fresh(role.lineageId) })),
    achievements: changes.achievements?.map((bullet) => ({
      ...bullet,
      lineageId: undefined,
      experienceLineageId: fresh(bullet.experienceLineageId),
    })),
    educations: changes.educations?.map((entry) => ({ ...entry, lineageId: undefined })),
    skills: changes.skills?.map((entry) => ({ ...entry, lineageId: undefined })),
    summaries: changes.summaries,
    projects: changes.projects?.map((entry) => ({ ...entry, lineageId: undefined })),
    certifications: changes.certifications?.map((entry) => ({ ...entry, lineageId: undefined })),
    customSections: changes.customSections?.map((entry) => ({ ...entry, lineageId: undefined })),
  };
}

type NameContact = { firstName?: string | null; lastName?: string | null };
type NameSource = { contact?: NameContact | null };

/** Letters and numbers, separated by a single underscore; shorten at a word boundary. */
function namePart(value: string, limit: number, words = Infinity): string {
  const clean = value
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '_')
    .replace(/^_|_$/g, '');
  let result = '';
  for (const word of clean.split('_').slice(0, words)) {
    const next = result ? `${result}_${word}` : word;
    if (Array.from(next).length > limit) break;
    result = next;
  }
  return result || Array.from(clean).slice(0, limit).join('');
}

/** Keep the main role rather than the posting's location, team or other suffixes. */
function roleForName(title: string): string {
  const role = title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .trim()
    .split(/[\r\n|•,–—]|\s+-\s+/u, 1)[0];
  return namePart(role, 40, 6);
}

/** full_name_CV_company_job_role, under 120 characters with no posting punctuation. */
export function tailoredResumeName(resume: NameSource, job: JobForCopy, profile?: NameContact): string {
  const fullName = [
    resume.contact?.firstName?.trim() || profile?.firstName?.trim(),
    resume.contact?.lastName?.trim() || profile?.lastName?.trim(),
  ]
    .filter(Boolean)
    .join(' ');
  return [
    namePart(fullName, 40),
    'CV',
    namePart(job.company ?? '', 32),
    roleForName(job.title ?? '') || roleForName(job.pageTitle ?? '') || 'Job',
  ]
    .filter(Boolean)
    .join('_');
}

/** Recognise only our generated names, so a person's chosen name stays intact. */
export function isAutomaticTailoredResumeName(
  name: string,
  resume: NameSource,
  job: JobForCopy,
  profile?: NameContact,
): boolean {
  const title = job.title ?? job.pageTitle ?? 'Job';
  const legacy = job.company ? `${title} — ${job.company}` : title;
  if (
    name === legacy ||
    name === tailoredResumeName(resume, job) ||
    name === tailoredResumeName(resume, job, profile)
  )
    return true;
  // Before compact names, the entire title was kept and only spaces were replaced.
  const fullName = [resume.contact?.firstName, resume.contact?.lastName].filter(Boolean).join(' ');
  const previous = [fullName, 'CV', job.company, job.title?.trim() || job.pageTitle?.trim() || 'Job']
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim().replace(/\s+/g, '_'))
    .join('_');
  return name === Array.from(previous).slice(0, 200).join('');
}
