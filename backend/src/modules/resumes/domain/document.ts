import type { Achievement, RenderedResume, ResumeChanges, SectionRows, VersionedRow } from './resume';

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
  const newId = new Map<string, string>();
  const fresh = (lineageId: string) => {
    const id = newId.get(lineageId) ?? generateId();
    newId.set(lineageId, id);
    return id;
  };
  const changes = toChanges(from);
  return {
    contact: changes.contact && { ...changes.contact, lineageId: undefined },
    experiences: changes.experiences?.map((role) => ({ ...role, lineageId: fresh(role.lineageId!) })),
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
