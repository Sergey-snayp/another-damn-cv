/**
 * A job's bullets on a CV, chosen for one posting from everything the person
 * keeps about that job in their Profile, plus what the CV already says.
 *
 * The AI chooses and rewords; this file decides what may be shown. A reworded
 * line keeps only the numbers its own achievement has, and the CV keeps the
 * same number of bullets for the job, so its layout does not change.
 */
import { withoutEmDashes } from './cv-writing-guide';

export interface CvRole {
  company: string;
  title: string;
  from: string;
  bullets: string[];
}
export interface ProfileRole extends CvRole {
  starred?: string[];
}
/** One achievement the AI may choose: from the CV's own bullets, or from the Profile. */
export interface PoolItem {
  id: string;
  text: string;
  source: 'cv' | 'profile';
  /** The CV bullet it is, for a CV item. */
  cvIndex: number | null;
  starred: boolean;
}
export interface ChosenBullet extends PoolItem {
  /** The achievement as written before rewording. */
  original: string;
}
export interface RoleBulletChoice {
  /** The CV's job was found in the Profile with achievements the CV does not show yet. */
  matched: boolean;
  profileRole: { title: string; company: string } | null;
  chosen: ChosenBullet[];
  /** Next best, for Swap. */
  alternates: ChosenBullet[];
}
export interface ChooserAnswer {
  chosen: { id: string; text: string }[];
  alternates: { id: string; text: string }[];
}

const SUFFIX = /\b(?:inc|llc|ltd|limited|gmbh|corp|corporation|co|plc|ag|sa|bv|oy)\b\.?/g;
const company = (name: string) =>
  name
    .toLowerCase()
    .replace(SUFFIX, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** The Profile's entry for a CV job: same company, then the same title or start year. */
export function matchProfileRole(roles: ProfileRole[], cv: CvRole): ProfileRole | null {
  const same = roles.filter((role) => company(role.company) && company(role.company) === company(cv.company));
  if (!same.length) return null;
  return (
    same.find((role) => plain(role.title) === plain(cv.title)) ??
    same.find((role) => role.from.slice(0, 4) && role.from.slice(0, 4) === cv.from.slice(0, 4)) ??
    (same.length === 1 ? same[0] : null)
  );
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
function overlap(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared);
}

/** What the AI chooses from: the CV's bullets, then the Profile's that the CV does not already say. */
export function rolePool(cv: CvRole, profile: ProfileRole): PoolItem[] {
  const starred = profile.starred ?? [];
  const items: PoolItem[] = cv.bullets
    .map((text, index) => ({ text: text.trim(), index }))
    .filter((bullet) => bullet.text)
    .map(({ text, index }) => ({
      id: `c${index + 1}`,
      text,
      source: 'cv',
      cvIndex: index,
      starred: starred.some((star) => overlap(star, text) >= 0.8),
    }));
  profile.bullets.forEach((text, index) => {
    if (!text.trim() || items.some((item) => overlap(item.text, text) >= 0.8)) return;
    items.push({
      id: `p${index + 1}`,
      text: text.trim(),
      source: 'profile',
      cvIndex: null,
      starred: starred.includes(text),
    });
  });
  return items.slice(0, 120);
}

/** Numbers as values ("20k" is 20,000); digits inside names (Route53, EC2) are not numbers. */
function numbersIn(text: string): Set<number> {
  const values = new Set<number>();
  for (const match of text.matchAll(/(?<![A-Za-z\d.])(\d[\d,]*(?:\.\d+)?)\s*([kKmMbB])?(?![a-zA-Z\d])/g)) {
    const scale = { k: 1e3, m: 1e6, b: 1e9 }[match[2]?.toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
    values.add(Number(match[1].replace(/,/g, '')) * scale);
  }
  for (const match of text.matchAll(
    /(?<![A-Za-z\d.])(\d+(?:\.\d+)?)\s*[-–]\s*\d+(?:\.\d+)?\s*([kKmMbB])(?![a-zA-Z\d])/g,
  ))
    values.add(Number(match[1]) * { k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase() as 'k' | 'm' | 'b']);
  return values;
}
/** "X." reworded as "X for reliability.": the posting's words tacked on, not a better line. */
const bare = (text: string) =>
  text
    .replace(/\*\*/g, '')
    .replace(/[.\s]+$/, '')
    .toLowerCase();
const tackedOn = (line: string, source: string) =>
  bare(line) !== bare(source) && bare(line).startsWith(bare(source));
const keepsNumbers = (line: string, source: string) => {
  const allowed = numbersIn(source);
  return [...numbersIn(line)].every((value) => allowed.has(value));
};

/**
 * The AI's choice, checked: real ids, each once; a reworded line that brings a
 * number its achievement lacks falls back to the achievement as written; and
 * exactly `count` bullets, filled with the next best (starred first) when short.
 */
export function checkChoice(
  answer: ChooserAnswer,
  pool: PoolItem[],
  count: number,
): Pick<RoleBulletChoice, 'chosen' | 'alternates'> {
  const byId = new Map(pool.map((item) => [item.id, item]));
  const used = new Set<string>();
  const take = (list: { id: string; text: string }[], limit: number): ChosenBullet[] => {
    const out: ChosenBullet[] = [];
    for (const { id, text } of list) {
      const item = byId.get(id);
      if (!item || used.has(id) || out.length === limit) continue;
      used.add(id);
      const reworded = withoutEmDashes(text.replace(/\s+/g, ' ').trim());
      const fine =
        reworded.length >= 8 &&
        reworded.length <= 400 &&
        keepsNumbers(reworded, item.text) &&
        !tackedOn(reworded, item.text);
      out.push({ ...item, text: fine ? reworded : item.text, original: item.text });
    }
    return out;
  };
  const chosen = take(answer.chosen, count);
  const rest = pool
    .filter((item) => !used.has(item.id))
    .sort(
      (a, b) =>
        Number(b.starred) - Number(a.starred) ||
        Number(a.source === 'profile') - Number(b.source === 'profile'),
    );
  while (chosen.length < count && rest.length) {
    const item = rest.shift()!;
    used.add(item.id);
    chosen.push({ ...item, original: item.text });
  }
  const alternates = take(answer.alternates, 4);
  for (const item of rest) {
    if (alternates.length === 4) break;
    if (used.has(item.id)) continue;
    used.add(item.id);
    alternates.push({ ...item, original: item.text });
  }
  return { chosen, alternates };
}
