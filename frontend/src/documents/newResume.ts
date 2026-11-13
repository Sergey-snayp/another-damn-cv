import { api } from '../api';
import { careerApi } from '../profile/careerApi';
import { resumeApi, type RenderedResume, type ResumeSummary } from '../resumeApi';
import { resumeFromProfile } from '../resume/studio/fromProfile';

/**
 * Ways to start a new resume, each saved on the server before it opens:
 * filled from the Profile, or a copy of a resume the person already has.
 * (Uploading a file is the third way; its draft waits in the editor for
 * "Keep this CV", since a parsed file may need checking.)
 */

/** A new resume filled from the Profile: contact details, summary, jobs, education and skills. */
export async function createFromProfile(): Promise<string> {
  const [profile, career] = await Promise.all([api.profile(), careerApi.read()]);
  const fullName = [profile.firstName, profile.lastName].filter((part) => part?.trim()).join(' ');
  const created = await resumeApi.create(fullName ? `${fullName} Resume` : 'Resume from Profile');
  const blank = await resumeApi.read(created.id);
  await resumeApi.save(created.id, resumeFromProfile(blank, profile, career.data), 'filled from Profile');
  return created.id;
}

/** Every lineage id made new, with each line still pointing at its job: a copy, not a second link to the same rows. */
export function withFreshIds(resume: RenderedResume): RenderedResume {
  const copy = structuredClone(resume) as unknown as Record<string, unknown>;
  const fresh = new Map<string, string>();
  const walk = (value: unknown, visit: (item: Record<string, unknown>) => void) => {
    if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
    else if (value && typeof value === 'object') {
      visit(value as Record<string, unknown>);
      Object.values(value).forEach((item) => walk(item, visit));
    }
  };
  walk(copy, (item) => {
    if (typeof item.lineageId === 'string') {
      const next = crypto.randomUUID();
      fresh.set(item.lineageId, next);
      item.lineageId = next;
    }
    // Snapshot and row ids belong to the original resume.
    delete item.id;
  });
  walk(copy, (item) => {
    if (typeof item.experienceLineageId === 'string') item.experienceLineageId = fresh.get(item.experienceLineageId) ?? item.experienceLineageId;
  });
  return copy as unknown as RenderedResume;
}

/** A new resume prefilled from one the person already has: its content and its design. */
export async function createCopy(source: ResumeSummary): Promise<string> {
  const [original, design] = await Promise.all([
    resumeApi.read(source.id),
    fetch(`/api/resumes/${encodeURIComponent(source.id)}/theme`, { credentials: 'include' })
      .then((response) => (response.ok ? (response.json() as Promise<{ theme: unknown }>) : { theme: null }))
      .catch(() => ({ theme: null })),
  ]);
  const created = await resumeApi.create(`${source.name} (copy)`, source.targetRole ?? undefined);
  await resumeApi.save(created.id, withFreshIds(original), `copied from ${source.name}`);
  if (design.theme)
    await fetch(`/api/resumes/${encodeURIComponent(created.id)}/theme`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(design.theme),
    }).catch(() => undefined);
  return created.id;
}
