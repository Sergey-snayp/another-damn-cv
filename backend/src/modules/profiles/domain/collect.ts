/**
 * "Collect from all my CVs": what the person's saved CVs say about their jobs
 * that the Profile does not have yet. Nothing is replaced: matching jobs get
 * the achievements and tools they are missing, and jobs the Profile lacks are
 * offered as new ones. The person chooses what to keep.
 */
import type { CareerExperience } from './career-profile';

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
  bullets: string[];
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
    text
      .toLowerCase()
      .replace(/\*\*/g, '')
      .replace(/[^a-z0-9+#./\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );
/** Two lines say the same thing: most of their words are shared. */
export function sameAchievement(a: string, b: string): boolean {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared) >= 0.6;
}

const tools = (stack: string) =>
  stack
    .split(/[,|;\n]/)
    .map((tool) => tool.trim())
    .filter(Boolean);

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
        tools: [],
        from: [],
      };
      found.set(key, entry);
    }
    const have = [...(role?.bullets ?? []), ...entry.bullets];
    const fresh = job.bullets
      .map((bullet) => bullet.trim())
      .filter((bullet) => bullet && !have.some((line) => sameAchievement(line, bullet)));
    for (const bullet of fresh)
      if (!entry.bullets.some((line) => sameAchievement(line, bullet))) entry.bullets.push(bullet);
    const known = [...tools(role?.techStack ?? ''), ...entry.tools].map((tool) => tool.toLowerCase());
    for (const tool of tools(job.techStack))
      if (!known.includes(tool.toLowerCase())) {
        entry.tools.push(tool);
        known.push(tool.toLowerCase());
      }
    if (entry.job && !entry.job.description && job.description) entry.job.description = job.description;
    if ((fresh.length || entry.job) && !entry.from.includes(job.cv)) entry.from.push(job.cv);
  }
  return [...found.values()].filter((entry) => entry.bullets.length || entry.tools.length || entry.job);
}
