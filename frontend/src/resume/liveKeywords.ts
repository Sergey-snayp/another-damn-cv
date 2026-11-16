import type { RenderedResume } from '../resumeApi';
import { usesKeyword } from './bulletCheck';

export interface KeywordStatus {
  /** In this CV, the job's order kept. */
  matched: string[];
  missing: string[];
  /** In this CV's Skills list only: no bullet, tech stack or summary names it. */
  skillsOnly: string[];
}

/** The CV's words, as the server's keyword match reads them; `work` leaves out Skills, companies and education. */
function cvText(resume: RenderedResume, work: boolean): string {
  return [
    resume.contact?.headline,
    ...Object.values(resume.summaries),
    ...resume.experiences.flatMap((role) => [
      role.title,
      work ? null : role.company,
      role.blurb,
      role.techStack,
      ...role.achievements.map((item) => item.bullet),
    ]),
    ...(resume.projects ?? []).flatMap((project) => [project.name, project.role, ...project.bullets]),
    ...(work ? [] : resume.educations.flatMap((row) => [row.degree, row.field, row.institution])),
    ...(work ? [] : (resume.certifications ?? []).flatMap((item) => [item.name, item.issuer])),
    ...(work ? [] : resume.skills.map((skill) => skill.name)),
    ...(resume.customSections ?? []).flatMap((section) => [work ? null : section.title, section.text, ...section.bullets]),
  ].filter(Boolean).join('\n');
}

/**
 * The job's keywords against the draft as it is now, not as last saved.
 *
 * The server's match knows every spelling of a keyword ("k8s" for Kubernetes), so
 * it is right for the CV it scored. Here a keyword takes the draft's answer only
 * where the edit changed it: the simple check reads the scored CV and the draft
 * the same way, and when both agree the server's answer stands.
 */
export function liveKeywords(
  keywords: { matched: string[]; missing: string[]; skillsOnly?: string[] },
  scored: RenderedResume,
  draft: RenderedResume,
): KeywordStatus {
  const texts = { scored: cvText(scored, false), draft: cvText(draft, false) };
  const work = { scored: cvText(scored, true), draft: cvText(draft, true) };
  const onlyListed = new Set(keywords.skillsOnly ?? []);
  const follow = (server: boolean, before: boolean, now: boolean) => (before === now ? server : now);
  const status: KeywordStatus = { matched: [], missing: [], skillsOnly: [] };
  for (const name of [...keywords.matched, ...keywords.missing]) {
    const server = keywords.matched.includes(name);
    const has = follow(server, usesKeyword(texts.scored, name), usesKeyword(texts.draft, name));
    if (!has) { status.missing.push(name); continue; }
    status.matched.push(name);
    const inWork = follow(server && !onlyListed.has(name), usesKeyword(work.scored, name), usesKeyword(work.draft, name));
    if (!inWork) status.skillsOnly.push(name);
  }
  return status;
}
