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

/**
 * How a CV line reads for the people and the software that screen it: a
 * recruiter who is often not technical and skims for about 7 seconds, and
 * search filters that match the posting's words, sometimes literally.
 *
 * Style only: every prompt's honesty rules still win. Nothing here allows a
 * fact, a benefit or an explanation the candidate's own facts do not give.
 */
export const RECRUITER_RULES = `WRITE FOR A NON-TECHNICAL RECRUITER AND FOR THE SEARCH FILTERS:
- Lead with what changed, in plain words (faster, cheaper, safer, fewer errors, less manual
  work, more customers), then how, then at most 2 key tools. The full tool list belongs in
  the job's tech stack line, not in a bullet.
- Say why it mattered to the business or its users only when the facts say so. Never add a
  purpose or benefit the facts do not state ("to reduce risk", "to improve quality",
  "for reliability", "instead of hardcoding").
- A name a recruiter would not know (an internal system, a codename, a niche vendor): explain
  it only with words the facts give, or leave it out when the line still holds without it.
  Never guess what a name is.
- Put the posting's matching term early in the line, in the posting's exact words.
- An acronym the posting spells out ("Continuous Integration and Delivery (CI/CD)") is written
  the same way: full words, then the acronym. Common ones (API, AWS, SQL) stay short.
- Make numbers easy to picture: "20,000 card payments a day" rather than "30-40k API requests",
  when the facts say what was counted.`;

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
  line says.

${RECRUITER_RULES}`;

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

const PURPOSE =
  /,?\s+(?:to (?:improve|reduce|ensure|enhance|increase|boost|speed up|support|enable|guard against|protect|drive|maximi[sz]e|minimi[sz]e|strengthen|harden|streamline|optimi[sz]e|prevent)|for (?:better |improved |greater |higher )?(?:reliability|scalability|security|performance|efficiency|resilience|maintainability|quality|visibility|stability)|in order to|instead of|ensuring|improving|enabling|reducing|resulting in|leading to)\b[^.;]*/i;
const CONTENT = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (word) =>
        word.length > 3 && !['with', 'that', 'into', 'from', 'more', 'less', 'their', 'than'].includes(word),
    );

/**
 * A purpose or benefit the AI tacked on ("…to reduce risk", "…for reliability")
 * that the facts do not state is cut, ending the line where the fact ends. A
 * clause whose words the facts do give stays.
 */
export function withoutAddedPurpose(line: string, facts: string): string {
  const match = PURPOSE.exec(line);
  if (!match) return line;
  const known = new Set(CONTENT(facts));
  const words = CONTENT(match[0]).filter(
    (word) => !['ensure', 'improve', 'reduce', 'enable', 'support'].includes(word),
  );
  if (words.length && words.filter((word) => known.has(word)).length / words.length >= 0.6) return line;
  const kept = line.slice(0, match.index).replace(/[\s,;:]+$/, '');
  return kept.length >= 8 ? `${kept}.` : line;
}
