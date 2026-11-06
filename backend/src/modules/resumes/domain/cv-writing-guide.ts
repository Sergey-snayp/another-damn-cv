import type { RenderedResume } from './resume';
import { resumeText } from './resume-score';

/**
 * How the AI writes CV text: the candidate's writing guide (accomplishment
 * statements, a recruiter's 7-second scan, the posting's own words). These are
 * style and structure only. The honesty rules stay with each prompt and always
 * win: a rule here never allows a fact the CV does not state.
 */

/** For every piece of CV text the AI writes. */
export const WRITING_RULES = `HOW TO WRITE (a recruiter scans a CV in about 7 seconds):
- Every line should help with this job. Where a fact on the CV matches the posting,
  use the posting's own words for it.
- Write numbers as digits: "3 teams", "16 integrations".
- US spelling ("optimize", "modeling", "behavior") unless the candidate's standing
  instructions ask for another.
- No em dashes. No "I", "me" or "my". No filler such as "passionate", "results-driven",
  "detail-oriented", "dynamic", "proven track record", "cutting-edge" or "world-class".
- No markdown or bold: the CV marks technologies itself.`;

/** The professional summary. */
export const SUMMARY_RULES = `HOW TO WRITE THE SUMMARY (3 or 4 sentences, about 80 to 120 words):
- Sentence 1: the job title closest to the posting's that the CV supports, the years of
  experience, the core stack, and the strongest result on the CV. Most recruiters read
  only the first 10 to 15 words, so the best match for this job goes there.
- Sentences 2 and 3: the 2 or 3 things this posting ranks highest, each backed by a
  result from the CV.
- Optional sentence 4: one thing that sets the candidate apart for this company.
- Leave out what the posting does not ask for. Mention AI work only if the posting asks
  for AI, and leadership only if it asks for leadership.
- No schema or table counts. Never mix two employers in one clause.`;

/** One bullet under a job or project. */
export const BULLET_RULES = `HOW TO WRITE A BULLET:
- Start with a strong past-tense verb and the result: the first 2 or 3 words are what
  gets read.
- An accomplishment, not a duty. "Reviewed pull requests" is a duty; "Cleared 2 security
  remediation cycles" is an accomplishment, when the facts say so.
- Pattern: what was done, how, and the result. Keep a number only when the line has
  one; never make one up.
- One idea per bullet, at most 2 lines (about 30 words). End with a period.
- Let the wording show ownership and follow-through, without claiming more than the
  line says.`;

/** The line under a job's title that says what the work was about. */
export const DESCRIPTION_RULES = `HOW TO WRITE A JOB'S DESCRIPTION LINE:
- One sentence: what the system or product does, for whom, and its scale when the
  facts give it. No duties and no list of technologies: the bullets and the tech stack
  line carry those.`;

/** The one line under the name. */
export const HEADLINE_RULES = `HOW TO WRITE THE HEADLINE:
- One short line: the job title closest to the posting's that the CV supports, then the
  core stack or domain this job asks for.`;

/** Suggesting skills to add (the lines themselves are never reordered or cut). */
export const SKILLS_RULES = `HOW TO CHOOSE SKILLS:
- Prefer the skills this posting asks for, in the posting's exact words when the CV
  names them that way.
- A true nearby skill the CV shows may be suggested (CDK where the posting asks for
  Terraform), under its own name. Never rename a skill to match the posting.
- Every skill suggested must already appear in a bullet, description or tech stack line.`;

/** Bullets to show per job in a full tailoring, by how recent and senior the job is. */
export const BULLET_COUNT_RULES = `HOW MANY BULLETS TO SHOW:
- 6 to 8 for the 2 most recent jobs, 3 to 5 for older ones, 2 or 3 for junior roles.
  Never more than the job has: hide (keep: false) only the weakest beyond these counts.
- Within each job, the bullets that match this posting come first.`;

/** The first and the latest year on the CV's jobs: "since 2019 (about 7 years)". */
export function experienceSpan(resume: RenderedResume, now = new Date()): string | null {
  const years = resume.experiences
    .map((role) => Number(/\b(19|20)\d{2}\b/.exec(role.from ?? '')?.[0]))
    .filter((year) => Number.isFinite(year) && year > 1900);
  if (!years.length) return null;
  const first = Math.min(...years);
  const span = Math.max(1, now.getFullYear() - first);
  return `Professional experience since ${first} (about ${span} years).`;
}

/** The CV as facts a summary may use: the span of experience, then the CV's own text. */
export function cvFacts(resume: RenderedResume, limit = 8_000): string {
  return [experienceSpan(resume), resumeText(resume).slice(0, limit)].filter(Boolean).join('\n');
}

/**
 * Em dashes out of AI-written text, as the guide asks: "Waivio — a platform"
 * becomes "Waivio, a platform". A dash between numbers (2019–2021) stays.
 */
export function withoutEmDashes(text: string): string {
  return text
    .replace(/\s*—\s*/g, ', ')
    .replace(/(\D)\s+–\s+(\D)/g, '$1, $2')
    .replace(/,\s*([,.;:])/g, '$1')
    .replace(/^,\s*/, '');
}
