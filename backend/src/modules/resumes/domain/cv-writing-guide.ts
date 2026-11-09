import type { RenderedResume } from './resume';
import { resumeText } from './resume-score';

/**
 * How the AI writes CV text: the candidate's writing guide (accomplishment
 * statements, a recruiter's 7-second scan, the posting's own words). These are
 * style and structure only. The honesty rules stay with each prompt and always
 * win: a rule here never allows a fact the CV does not state.
 */

/** For every piece of CV text the AI writes. */
export const DASH_PUNCTUATION_RULE = `Do not use dashes as sentence punctuation: no em dash, en dash, or spaced hyphen.
Use commas, colons, semicolons or a new sentence instead. This also applies when rewriting
source text that contains dashes. Preserve real hyphenated words, technology names, URLs,
numeric/date ranges and code; do not change quoted source evidence or exact form options.`;

export const WRITING_RULES = `HOW TO WRITE (a recruiter scans a CV in about 7 seconds):
- Every line should help with this job. Where a fact on the CV matches the posting,
  use the posting's own words for it.
- Write numbers as digits: "3 teams", "16 integrations".
- US spelling ("optimize", "modeling", "behavior") unless the candidate's standing
  instructions ask for another.
- ${DASH_PUNCTUATION_RULE}
- No "I", "me" or "my". No filler such as "passionate", "results-driven",
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
- The first words carry what changed, in words a recruiter who is not technical follows
  (faster, cheaper, safer, fewer errors, less manual work, more customers); the mechanism
  and its tools come after.
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

/**
 * Bullets from another field, written to the standard: they show how a bullet
 * reads, never what it says. The checks in code drop any name or number the
 * candidate's own facts do not have, so a fact copied from here cannot survive.
 */
export const STYLE_EXAMPLES = `STYLE EXAMPLES from other people's CVs in other fields. They show the standard only;
their facts belong to them. Never use their names, numbers, tools or outcomes.
- Cut late deliveries from 12% to 4% by re-sequencing driver routes each morning from the
  overnight order file. Dispatchers stopped re-planning by hand, and the schedule still
  runs across 3 depots.
- Led a 40-bed ward's move from paper charts to electronic records, training 25 nurses in
  pairs on night shifts so that no shift ran without someone who knew the system.
- Rebuilt the month-end close checklist after 2 late closes, splitting reconciliations by
  owner so a missing bank statement held up one line instead of the whole close.`;

/** One bullet under a job or project: the standard every bullet is held to. */
export const BULLET_RULES = `HOW TO WRITE A BULLET (the standard every bullet is held to):
- One piece of work per bullet, told fully: what changed, how it worked, and why it was
  done that way. An accomplishment, never a bare duty ("Reviewed pull requests").
- Start with a strong past-tense verb and what changed: the first words carry the result.
- Show the mechanism, not just the tool: "a daily renewal sweep over the expiry index",
  not "used a database".
- When the facts give them, show:
  - before and after ("...rejected with a reason instead of failing the whole batch");
  - the decision and its reason ("chose X over Y so that Z");
  - honest ownership ("as its principal author", "led a 3-person team", "alongside its
    owner");
  - real counts (services, models, integrations, audits, people);
  - that it lasted ("still in production", "now used to onboard new engineers").
- Leave out any of these the facts do not give. Never invent a reason, a before, an
  outcome, a count or a role, and never claim more than the facts say.
- Up to about 45 words, one or two sentences. End with a period.
- ${DASH_PUNCTUATION_RULE}
- Technologies by their real names; the CV marks them in bold itself.

${STYLE_EXAMPLES}

${RECRUITER_RULES}`;

/** The line under a job's title that says what the work was about. */
export const DESCRIPTION_RULES = `HOW TO WRITE A JOB'S DESCRIPTION LINE:
- ${DASH_PUNCTUATION_RULE}
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
 * Enforce the writing preference on generated prose even when a model ignores it.
 * Preserve factual ranges, hyphenated names, URLs and code. Source records stay untouched.
 */
export function withoutDashPunctuation(text: string): string {
  const prose = (part: string) =>
    part
      .replace(/[ \t]*[—–‒―][ \t]*|[ \t]+-+[ \t]+/g, (dash, offset: number, whole: string) => {
        const before = whole.slice(0, offset).trimEnd();
        const after = whole.slice(offset + dash.length).trimStart();
        if (!after || whole[offset + dash.length] === '\n') return '';
        const numericRange = /\d[\d.,]*\s*[kKmMbB%]?$/.test(before) && /^\d/.test(after);
        const dateRange =
          /(?:19|20)\d{2}$/.test(before) &&
          /^(?:present|current|now|Jan\w*|Feb\w*|Mar\w*|Apr\w*|May|Jun\w*|Jul\w*|Aug\w*|Sep\w*|Oct\w*|Nov\w*|Dec\w*)\b/i.test(
            after,
          );
        if (numericRange || dateRange) return dash.replace(/[—‒―]/g, '-');
        return ', ';
      })
      .replace(/[ \t]+,/g, ',')
      .replace(/,[ \t]*([,.;:!?])/g, '$1')
      .replace(/(^|\n),[ \t]*/g, '$1');
  const protectedParts: string[] = [];
  let prefix = '\uE000';
  while (text.includes(prefix)) prefix += '\uE000';
  const masked = text.replace(
    /```[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s<>]+/g,
    (part) => `${prefix}${protectedParts.push(part) - 1}\uE001`,
  );
  return prose(masked).replace(
    new RegExp(`${prefix}(\\d+)\uE001`, 'g'),
    (_match, index: string) => protectedParts[Number(index)],
  );
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
