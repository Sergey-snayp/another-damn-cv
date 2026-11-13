/**
 * "Collect from all my CVs": what the person's saved CVs say about their jobs
 * that the Profile does not have yet. Nothing is replaced: matching jobs get
 * the achievements and tools they are missing, and jobs the Profile lacks are
 * offered as new ones. The person chooses what to keep.
 */
import type { CareerExperience } from './career-profile';
import { withoutMarks } from './text-marks';

/** One job as a saved CV shows it. */
export interface CvJob {
  cv: string;
  company: string;
  client: string;
  title: string;
  location: string;
  from: string;
  to: string;
  current: boolean;
  description: string;
  techStack: string;
  bullets: string[];
}

export interface CollectedJob {
  /** The Profile job these belong to, by its place in the list; null for a job the Profile lacks. */
  index: number | null;
  company: string;
  title: string;
  /** The new job itself, when `index` is null. */
  job: CareerExperience | null;
  /** Lines the Profile has nothing like: offered ticked. */
  bullets: string[];
  /** Lines close to one the Profile has (`mine`): offered to compare, unticked. */
  similar: { line: string; mine: string }[];
  tools: string[];
  /** The CVs these came from, by name. */
  from: string[];
}

const SUFFIX = /\b(?:inc|llc|ltd|limited|gmbh|corp|corporation|co|plc|ag|sa|bv|oy)\b\.?/g;
const companyKey = (name: string) =>
  name
    .toLowerCase()
    .replace(SUFFIX, ' ')
    .replace(/[^a-z0-9]+/g, '');
const titleKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The Profile job a CV job is: same company, then the same title or start year. */
export function matchJob(roles: CareerExperience[], job: CvJob): number | null {
  const same = roles
    .map((role, index) => ({ role, index }))
    .filter(({ role }) => companyKey(role.company) && companyKey(role.company) === companyKey(job.company));
  if (!same.length) return null;
  const hit =
    same.find(({ role }) => titleKey(role.title) === titleKey(job.title)) ??
    same.find(({ role }) => role.from.slice(0, 4) && role.from.slice(0, 4) === job.from.slice(0, 4)) ??
    (same.length === 1 ? same[0] : undefined);
  return hit ? hit.index : null;
}

const STOP = new Set(
  'a an and the of for to in on at by with from into as was were is are this that it'.split(' '),
);
const words = (text: string) =>
  new Set(
    withoutMarks(text)
      .toLowerCase()
      .replace(/[^a-z0-9+#./\s-]/g, ' ')
      .split(/\s+/)
      .map((word) => word.replace(/^[.-]+|[.-]+$/g, ''))
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );
/** How much two lines share, 0 to 1: their common words over all their words. */
export function likeness(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared);
}
/** Two lines say the same thing: most of their words are shared. */
export function sameAchievement(a: string, b: string): boolean {
  return likeness(a, b) >= 0.6;
}
const letters = (text: string) => withoutMarks(text).toLowerCase().replace(/[^a-z0-9]+/g, '');
/** The same line, but for spaces, case or punctuation ("Route53" / "Route 53"), or nearly every word shared. */
export const sameLine = (a: string, b: string) => letters(a) === letters(b) || likeness(a, b) >= 0.9;
/**
 * Close enough to compare side by side: half their words shared, or most of the
 * shorter line's (at least 4 words) found in the other, as when a CV line says
 * the same thing with more detail.
 */
export function closeness(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  const contained = shared >= 4 ? shared / Math.min(left.size, right.size) : 0;
  return Math.max(likeness(a, b), contained >= 0.6 ? contained * 0.8 : 0);
}
const SIMILAR = 0.5;

const tools = (stack: string) =>
  stack
    .split(/[,|;\n]/)
    .map((tool) => tool.trim())
    .filter(Boolean);

/** A line that says what one of the others already says. */
export const repeats = (line: string, others: string[]) =>
  others.some((other) => sameAchievement(line, other));

/** The verb a line opens with ("Built", "Led"), lower-cased; "" for none. */
export const openingVerb = (text: string) =>
  (withoutMarks(text).trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z-]/g, '');

export function collectFromCvs(roles: CareerExperience[], jobs: CvJob[]): CollectedJob[] {
  const found = new Map<string, CollectedJob>();
  for (const job of jobs) {
    const index = matchJob(roles, job);
    const key = index === null ? `new:${companyKey(job.company)}|${titleKey(job.title)}` : `at:${index}`;
    const role = index === null ? null : roles[index];
    let entry = found.get(key);
    if (!entry) {
      entry = {
        index,
        company: role?.company ?? job.company,
        title: role?.title ?? job.title,
        job:
          index === null
            ? {
                company: job.company,
                title: job.title,
                client: job.client,
                location: job.location,
                from: job.from,
                to: job.to,
                current: job.current,
                description: job.description,
                bullets: [],
                techStack: '',
              }
            : null,
        bullets: [],
        similar: [],
        tools: [],
        from: [],
      };
      found.set(key, entry);
    }
    const mine = role?.bullets ?? [];
    const offered = () => [...entry!.bullets, ...entry!.similar.map((item) => item.line)];
    let added = false;
    for (const bullet of job.bullets.map((line) => line.trim()).filter(Boolean)) {
      // Already in the Profile, or already offered from another CV.
      if (mine.some((line) => sameLine(line, bullet)) || offered().some((line) => sameAchievement(line, bullet))) continue;
      const closest = mine
        .map((line) => ({ line, score: closeness(line, bullet) }))
        .sort((a, b) => b.score - a.score)[0];
      if (closest && closest.score >= SIMILAR) entry.similar.push({ line: bullet, mine: closest.line });
      else entry.bullets.push(bullet);
      added = true;
    }
    const known = [...tools(role?.techStack ?? ''), ...entry.tools].map((tool) => tool.toLowerCase());
    for (const tool of tools(job.techStack))
      if (!known.includes(tool.toLowerCase())) {
        entry.tools.push(tool);
        known.push(tool.toLowerCase());
      }
    if (entry.job && !entry.job.description && job.description) entry.job.description = job.description;
    if ((added || entry.job) && !entry.from.includes(job.cv)) entry.from.push(job.cv);
  }
  return [...found.values()].filter((entry) => entry.bullets.length || entry.similar.length || entry.tools.length || entry.job);
}
