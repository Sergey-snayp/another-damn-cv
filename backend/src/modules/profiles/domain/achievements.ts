/**
 * Achievements written from a person's own notes about one job.
 *
 * The AI proposes; this file decides what may be shown. An achievement may only
 * hold numbers the person wrote, a tool is offered only when the notes name it,
 * and a line that repeats one the job already has is marked, not added twice.
 */

/** What the AI writes from: the job as saved, and everything the person wrote about it. */
export interface AchievementSource {
  title: string;
  company: string;
  client: string;
  description: string;
  bullets: string[];
  techStack: string;
  notes: string;
}

/** The AI's answer before checking. */
export interface AchievementDraft {
  achievements: { text: string; asks: string[] }[];
  techStack: string[];
  description: string;
}

export interface ProposedAchievement {
  text: string;
  /** Up to 2 questions whose answers would make the line fuller: before, reason, part, count, still used. */
  asks: string[];
  /** The job's existing line this one repeats, when it does. */
  duplicateOf: string | null;
}

export interface AchievementProposal {
  achievements: ProposedAchievement[];
  /** Tools from the notes that the job's tech stack does not list yet. */
  techStack: string[];
  /** A role description, offered only when the job has none. */
  description: string;
  /** Lines left out because they held a number or a name the notes do not. */
  dropped: number;
}

export class AchievementError extends Error {}

export const MAX_ACHIEVEMENTS = 40;
const STOP = new Set(
  'a an and the of for to in on at by with from into over under via our my their its as was were is are be been this that these those it'.split(
    ' ',
  ),
);

/** Tidy: no list marker and single spaces; the writer enforces prose punctuation. */
const plain = (text: string) =>
  text
    .replace(/^\s*(?:[-•*·]|\d+[.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#./\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );

/** Share of words two lines have in common (Jaccard). */
function overlap(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / (left.size + right.size - shared);
}

/**
 * Every number in a text as a value: "20k" and "20,000" are the same, so are "1.5M" and "1,500,000".
 * Digits inside a name (Route53, EC2, S3) are not numbers.
 */
export function numbersIn(text: string): Set<number> {
  const values = new Set<number>();
  for (const match of text.matchAll(/(?<![A-Za-z\d.])(\d[\d,]*(?:\.\d+)?)\s*([kKmMbB])?(?![a-zA-Z\d])/g)) {
    const value = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const scale = { k: 1e3, m: 1e6, b: 1e9 }[match[2]?.toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
    values.add(value * scale);
  }
  // A range written once with its scale ("15-20k") means 15,000 to 20,000.
  for (const match of text.matchAll(
    /(?<![A-Za-z\d.])(\d+(?:\.\d+)?)\s*[-–]\s*\d+(?:\.\d+)?\s*([kKmMbB])(?![a-zA-Z\d])/g,
  )) {
    const scale = { k: 1e3, m: 1e6, b: 1e9 }[match[2].toLowerCase() as 'k' | 'm' | 'b'];
    values.add(Number(match[1]) * scale);
  }
  return values;
}

/** True when every number in the line is one the person wrote. */
function numbersSupported(line: string, source: Set<number>): boolean {
  for (const value of numbersIn(line)) if (!source.has(value)) return false;
  return true;
}

/** Words a line may use without the facts naming them. */
const GENERIC = new Set(
  'API APIS REST UI UX QA CI CD SDK HTTP HTTPS JSON SQL ID IDS PDF CSV AI ML US EU UK'.split(' '),
);
/**
 * Names in a line that the facts do not have: technologies, products, companies,
 * codenames. A name copied from an example or guessed cannot pass.
 */
export function unknownNames(line: string, facts: string): string[] {
  const known = facts.toLowerCase();
  const tokens = line.replace(/\*\*/g, '').trim().split(/\s+/);
  const names = tokens
    .map((token, index) => ({
      word: token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.+#]+$/g, '').replace(/\.$/, ''),
      index,
    }))
    .filter(({ word, index }) => {
      if (
        word.length < 2 ||
        GENERIC.has(word.toUpperCase()) ||
        GENERIC.has(word.replace(/s$/, '').toUpperCase())
      )
        return false;
      const shaped = /[a-z][A-Z]|\d[A-Za-z]|[A-Za-z]\d|\.js$|^[A-Z]{2,}s?$/.test(word);
      const capital = /^[A-Z]/.test(word) && index > 0 && !/[.!?:]$/.test(tokens[index - 1] ?? '');
      return shaped || capital;
    })
    .map(({ word }) => word);
  return [...new Set(names.filter((word) => !known.includes(word.toLowerCase())))];
}

/**
 * One rewritten line, checked against everything the person wrote: a number or
 * a name they did not give drops the line (null), and a benefit they did not
 * state is cut by the caller.
 */
export function supported(line: string, facts: string): boolean {
  const known = numbersIn(facts);
  return [...numbersIn(line)].every((value) => known.has(value)) && !unknownNames(line, facts).length;
}

const toolList = (stack: string) =>
  stack
    .split(/[,|;\n]/)
    .map((tool) => tool.trim().toLowerCase())
    .filter(Boolean);

export function checkProposal(draft: AchievementDraft, source: AchievementSource): AchievementProposal {
  const everything = [
    source.title,
    source.company,
    source.client,
    source.description,
    ...source.bullets,
    source.techStack,
    source.notes,
  ].join('\n');
  const known = numbersIn(everything);
  const achievements: ProposedAchievement[] = [];
  let dropped = 0;
  for (const item of draft.achievements) {
    const text = plain(item.text).slice(0, 700);
    if (text.length < 8) continue;
    if (!numbersSupported(text, known) || unknownNames(text, everything).length) {
      dropped++;
      continue;
    }
    // The same line twice in one answer is kept once.
    if (achievements.some((kept) => overlap(kept.text, text) >= 0.75)) continue;
    const duplicateOf = source.bullets.find((bullet) => overlap(bullet, text) >= 0.6) ?? null;
    const asks = item.asks
      .map((ask) => ask.trim())
      .filter(Boolean)
      .slice(0, 2)
      .map((ask) => ask.slice(0, 200));
    achievements.push({ text, asks, duplicateOf });
    if (achievements.length === MAX_ACHIEVEMENTS) break;
  }
  const have = toolList(source.techStack);
  const notes = source.notes.toLowerCase();
  // Named in the notes: as written, or every word of it ("AWS Step Functions" for "step functions on aws").
  const named = (tool: string) =>
    notes.includes(tool.toLowerCase()) ||
    tool
      .toLowerCase()
      .split(/[\s/-]+/)
      .filter((part) => part.length > 1)
      .every((part) => notes.includes(part));
  const techStack = [
    ...new Map(
      draft.techStack
        .map((tool) => tool.trim().replace(/\.$/, ''))
        .filter((tool) => tool.length > 0 && tool.length <= 60)
        .filter((tool) => named(tool) && !have.includes(tool.toLowerCase()))
        .map((tool) => [tool.toLowerCase(), tool]),
    ).values(),
  ].slice(0, 20);
  const description =
    !source.description.trim() && draft.description.trim() && numbersSupported(draft.description, known)
      ? plain(draft.description).slice(0, 600)
      : '';
  return { achievements, techStack, description, dropped };
}
