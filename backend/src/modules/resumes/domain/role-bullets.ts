/**
 * A job's bullets on a CV, chosen for one posting from everything the person
 * keeps about that job in their Profile and saved CVs.
 *
 * The AI chooses and rewords; this file decides what may be shown. A reworded
 * line keeps only the numbers its own achievement has. One bullet keeps one
 * bullet; a whole job gets as many as the posting gives reason for, within
 * bulletRange.
 */
import { withoutAddedPurpose, withoutDashPunctuation } from './cv-writing-guide';
import { unsupportedClaims } from './tailoring/claims';

export interface CvRole {
  company: string;
  title: string;
  from: string;
  client?: string;
  description?: string;
  techStack?: string;
  /** Set by the saved-CV reader to disambiguate roles within each document. */
  resumeId?: string;
  bullets: string[];
}
export interface ProfileRole extends CvRole {
  starred?: string[];
  notes?: string[];
}
/** One supported achievement or context item from the selected CV, Profile or another saved CV. */
export interface PoolItem {
  id: string;
  text: string;
  source: 'cv' | 'profile' | 'saved-cv';
  /** The CV bullet it is, for a CV item. */
  cvIndex: number | null;
  starred: boolean;
  /** Context may become a supported bullet; raw notes are never copied into the CV. */
  kind?: 'bullet' | 'context';
}
export interface ChosenBullet extends PoolItem {
  /** The achievement as written before rewording. */
  original: string;
}
export interface RoleBulletChoice {
  /** Additional evidence was found for the selected role. */
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
    .replace(/[^a-z0-9]+/g, '')
    .trim();
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const evidenceKey = (text: string) => text.replace(/\*\*/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Match employer/client first, then dates; use title only when it identifies one role. */
export function matchProfileRole(roles: ProfileRole[], cv: CvRole): ProfileRole | null {
  const employer = company(cv.company),
    client = company(cv.client ?? '');
  let same = roles.filter(
    (role) => employer && (company(role.company) === employer || company(role.client ?? '') === employer),
  );
  if (client) {
    const exactClient = same.filter(
      (role) => company(role.client ?? '') === client || company(role.company) === client,
    );
    same = exactClient.length ? exactClient : same.filter((role) => !role.client?.trim());
  }
  if (!same.length) return null;
  const unique = (candidates: ProfileRole[]) => (candidates.length === 1 ? candidates[0] : null);
  if (cv.from.trim()) {
    const exactDate = same.filter((role) => role.from.trim() === cv.from.trim());
    if (exactDate.length)
      return unique(exactDate) ?? unique(exactDate.filter((role) => plain(role.title) === plain(cv.title)));
    const year = cv.from.match(/(?:19|20)\d{2}/)?.[0];
    const sameYear = year ? same.filter((role) => role.from.includes(year)) : [];
    if (sameYear.length)
      return unique(sameYear) ?? unique(sameYear.filter((role) => plain(role.title) === plain(cv.title)));
    same = same.filter((role) => !role.from.trim());
  }
  return unique(same.filter((role) => plain(role.title) === plain(cv.title))) ?? unique(same);
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

/** Pool matching-role facts without discarding similar bullets that contain different technologies. */
export function rolePool(cv: CvRole, profile: ProfileRole | null, otherCvs: CvRole[] = []): PoolItem[] {
  const starred = profile?.starred ?? [];
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
  const add = (item: PoolItem) => {
    if (!item.text.trim() || items.some((existing) => evidenceKey(existing.text) === evidenceKey(item.text)))
      return;
    items.push({ ...item, text: item.text.trim() });
  };
  profile?.bullets.forEach((text, index) => {
    add({
      id: `p${index + 1}`,
      text: text.trim(),
      source: 'profile',
      cvIndex: null,
      starred: starred.includes(text),
    });
  });
  const context = (role: CvRole, prefix: string, source: PoolItem['source'], notes: string[] = []) => {
    for (const [index, text] of [
      role.description,
      role.techStack ? `Tools used in this role: ${role.techStack}` : '',
      ...notes,
    ].entries()) {
      if (text?.trim())
        add({ id: `${prefix}f${index + 1}`, text, source, cvIndex: null, starred: false, kind: 'context' });
    }
  };
  context(cv, 'c', 'cv');
  if (profile) context(profile, 'p', 'profile', profile.notes);
  otherCvs.forEach((role, index) => {
    role.bullets.forEach((text, bullet) =>
      add({ id: `r${index + 1}b${bullet + 1}`, text, source: 'saved-cv', cvIndex: null, starred: false }),
    );
    context(role, `r${index + 1}`, 'saved-cv');
  });
  return items;
}

/**
 * How many bullets a whole job may get, by its place on the CV (0 = the latest
 * job): recent jobs up to 6, the two before up to 4, older ones up to 3, and at
 * least 2 when there is that much to say.
 */
export function bulletRange(position: number, available: number): { min: number; max: number } {
  const most = position < 2 ? 6 : position < 4 ? 4 : 3;
  const min = Math.min(2, available);
  return { min, max: Math.max(min, Math.min(most, available)) };
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
 * at most `count` bullets, filled with the next best (starred first) up to `min`.
 */
export function checkChoice(
  answer: ChooserAnswer,
  pool: PoolItem[],
  count: number,
  min = count,
): Pick<RoleBulletChoice, 'chosen' | 'alternates'> {
  const byId = new Map(pool.map((item) => [item.id, item]));
  const used = new Set<string>();
  const take = (list: { id: string; text: string }[], limit: number): ChosenBullet[] => {
    const out: ChosenBullet[] = [];
    for (const { id, text } of list) {
      const item = byId.get(id);
      if (!item || used.has(id) || out.length === limit) continue;
      used.add(id);
      const reworded = withoutDashPunctuation(
        withoutAddedPurpose(text.replace(/\s+/g, ' ').trim(), item.text),
      );
      const fine =
        reworded.length >= 8 &&
        reworded.length <= 400 &&
        keepsNumbers(reworded, item.text) &&
        !unsupportedClaims(reworded, item.text).length &&
        !tackedOn(reworded, item.text);
      if (!fine && item.kind === 'context') {
        used.delete(id);
        continue;
      }
      out.push({ ...item, text: fine ? reworded : withoutDashPunctuation(item.text), original: item.text });
    }
    return out;
  };
  const chosen = take(answer.chosen, count);
  const rest = pool
    .filter((item) => !used.has(item.id) && item.kind !== 'context')
    .sort(
      (a, b) =>
        Number(b.starred) - Number(a.starred) ||
        Number(a.source === 'profile') - Number(b.source === 'profile'),
    );
  while (chosen.length < min && rest.length) {
    const item = rest.shift()!;
    used.add(item.id);
    chosen.push({ ...item, text: withoutDashPunctuation(item.text), original: item.text });
  }
  const alternates = take(answer.alternates, 4);
  for (const item of rest) {
    if (alternates.length === 4) break;
    if (used.has(item.id)) continue;
    used.add(item.id);
    alternates.push({ ...item, text: withoutDashPunctuation(item.text), original: item.text });
  }
  return { chosen, alternates };
}
