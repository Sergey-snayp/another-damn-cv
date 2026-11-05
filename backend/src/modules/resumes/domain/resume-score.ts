import { findKeywords, scoreCv, type KeywordMatch } from './job-keywords';
import type { RenderedResume } from './resume';

/** The editor's sections an issue points at, so its card can show a badge. */
export type IssueSection = 'header' | 'summary' | 'experience' | 'projects' | 'education' | 'certifications' | 'skills';

export interface ResumeIssue {
  section: IssueSection;
  /** "keyword": the job asks for it; "content": what the CV says; "format": how it reads. */
  kind: 'keyword' | 'content' | 'format';
  message: string;
  /** The role or row it is about, when it is about one. */
  lineageId?: string;
}

export interface ResumeScore {
  /** 0–100 for the job; null without a job to score against. */
  score: number | null;
  keywords: KeywordMatch | null;
  issues: ResumeIssue[];
}

const WEAK_OPENINGS = /^(responsible for|worked on|helped( to)?|assisted( with| in)?|involved in|participated in|tasked with|duties included)\b/i;
const HAS_NUMBER = /\d/;
const words = (text: string | null | undefined) => (text ?? '').trim().split(/\s+/).filter(Boolean).length;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** All the CV's words, as the keyword match reads them. */
export function resumeText(resume: RenderedResume): string {
  const contact = resume.contact;
  return [
    contact?.headline,
    ...Object.values(resume.summaries),
    ...resume.experiences.flatMap((role) => [role.title, role.company, role.blurb, ...role.achievements.map((a) => a.bullet)]),
    ...(resume.projects ?? []).flatMap((project) => [project.name, project.role, ...project.bullets]),
    ...resume.educations.flatMap((row) => [row.degree, row.field, row.institution]),
    ...(resume.certifications ?? []).flatMap((item) => [item.name, item.issuer]),
    ...resume.skills.map((skill) => skill.name),
    ...(resume.customSections ?? []).flatMap((section) => [section.title, section.text, ...section.bullets]),
  ]
    .filter(Boolean)
    .join('\n');
}

/** What a recruiter or an ATS would trip on, whatever the job. */
export function checkResume(resume: RenderedResume): ResumeIssue[] {
  const issues: ResumeIssue[] = [];
  const add = (section: IssueSection, kind: ResumeIssue['kind'], message: string, lineageId?: string) =>
    issues.push({ section, kind, message, ...(lineageId ? { lineageId } : {}) });

  const contact = resume.contact;
  if (!contact?.email?.trim()) add('header', 'content', 'Add your email address.');
  if (!contact?.phone?.trim()) add('header', 'content', 'Add a phone number.');
  if (!contact?.location?.trim()) add('header', 'content', 'Add your city and country: many jobs filter by location.');
  if (!contact?.linkedin?.trim()) add('header', 'content', 'Add your LinkedIn profile.');

  const summary = resume.summaries.default ?? '';
  if (!summary.trim()) add('summary', 'content', 'Add a short summary: what you do, in what domain, at what depth.');
  else if (words(summary) > 90) add('summary', 'format', `The summary has ${words(summary)} words. Keep it under 90.`);

  if (!resume.experiences.length) add('experience', 'content', 'Add your work experience.');
  const bullets = resume.experiences.flatMap((role) => role.achievements.map((a) => a.bullet.trim()).filter(Boolean));
  for (const role of resume.experiences) {
    const name = role.title || role.company || 'A role';
    const lines = role.achievements.map((a) => a.bullet.trim()).filter(Boolean);
    if (!role.from?.trim()) add('experience', 'content', `${name}: add when it started.`, role.lineageId);
    if (!role.current && !role.to?.trim() && role.from?.trim())
      add('experience', 'content', `${name}: add when it ended, or mark it as current.`, role.lineageId);
    if (!lines.length) add('experience', 'content', `${name}: add bullets with what you did and what it changed.`, role.lineageId);
    const long = lines.filter((line) => words(line) > 35).length;
    if (long) add('experience', 'format', `${name}: ${plural(long, 'bullet')} over 35 words. Keep each to one or two lines.`, role.lineageId);
    const weak = lines.filter((line) => WEAK_OPENINGS.test(line)).length;
    if (weak)
      add('experience', 'format', `${name}: ${plural(weak, 'bullet')} ${weak === 1 ? 'starts' : 'start'} with "Responsible for" or similar. Lead with what you did.`, role.lineageId);
  }
  const withNumbers = bullets.filter((line) => HAS_NUMBER.test(line)).length;
  if (bullets.length >= 3 && withNumbers / bullets.length < 0.3)
    add('experience', 'content', `Only ${withNumbers} of ${bullets.length} bullets show a result in numbers. Add the numbers you have.`);
  const seen = new Set<string>();
  const repeated = bullets.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  }).length;
  if (repeated) add('experience', 'format', `${plural(repeated, 'bullet')} ${repeated === 1 ? 'is' : 'are'} repeated word for word.`);

  if (!resume.educations.length) add('education', 'content', 'Add your education, or hide the section in Layout.');
  if (resume.skills.length < 5) add('skills', 'content', `List at least 5 skills (${resume.skills.length} now).`);

  const total = words(resumeText(resume));
  if (total > 1100) add('experience', 'format', `The CV has about ${total} words: more than two pages. Cut older or weaker bullets.`);
  return issues;
}

/**
 * The score for one job: how much of the job's keywords the CV mentions
 * (most of it), less a little for each thing the checks found.
 */
export function scoreResume(resume: RenderedResume, jobText?: string | null): ResumeScore {
  const issues = checkResume(resume);
  const keywords = jobText?.trim() ? findKeywords(jobText) : [];
  if (!keywords.length) return { score: null, keywords: null, issues };
  const match = scoreCv(keywords, resumeText(resume));
  const missing = match.missing.map<ResumeIssue>((name) => ({
    section: 'skills',
    kind: 'keyword',
    message: `The job asks for ${name}. Add it where you have used it.`,
  }));
  const quality = Math.max(0, 100 - 8 * issues.length);
  return { score: Math.round(0.75 * match.score + 0.25 * quality), keywords: match, issues: [...missing, ...issues] };
}
