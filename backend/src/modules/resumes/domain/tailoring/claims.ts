/**
 * The guard: numbers and technologies a rewrite added that its source does not
 * contain. The prompt asks the model not to invent; this makes sure.
 *
 * It checks words, not meaning — "led" for "worked on" gets past it, which is
 * why every line is still reviewed by a person.
 */
import type { RenderedExperience, RenderedResume } from './resume';
import { withoutMarks } from '../text-marks';

/**
 * Numbers and technologies in `text` that `source` does not contain.
 *
 * A word counts as a technology when it looks like one (AWS, DynamoDB,
 * Node.js, C#, S3), when it is capitalised mid-sentence, or when the posting
 * uses it that way — the last catches "Java" opening a sentence.
 */
export function unsupportedClaims(
  text: string,
  source: string,
  jobTerms: ReadonlySet<string> = new Set(),
): string[] {
  // Words alone: a link address or a mark is not a claim.
  text = withoutMarks(text);
  source = withoutMarks(source);
  const known = vocabulary(source);
  const knownNumbers = new Set(numbersIn(source));
  const problems = new Set<string>();

  for (const number of numbersIn(text)) {
    if (!knownNumbers.has(number)) problems.add(number);
  }

  for (const { word, sentenceStart } of wordsIn(text)) {
    if (!hasLetter(word)) continue;
    const capitalised = /^\p{Lu}/u.test(word);
    const suspect =
      looksTechnical(word) ||
      (capitalised && !sentenceStart) ||
      (capitalised && jobTerms.has(word.toLowerCase()));
    if (suspect && !isKnown(word, known)) problems.add(word);
  }

  return [...problems];
}

/** Terms the posting uses as names: the ones a model would be tempted to copy. */
export function techTerms(text: string): Set<string> {
  const terms = new Set<string>();
  for (const { word, sentenceStart } of wordsIn(text)) {
    if (hasLetter(word) && (looksTechnical(word) || (!sentenceStart && /^\p{Lu}/u.test(word)))) {
      terms.add(word.toLowerCase());
    }
  }
  return terms;
}

/** "20,000" and "20k" are the same claim; "~75%" is 75. Numbers glued to letters (S3, OAuth2) are names. */
export function numbersIn(text: string): string[] {
  const numbers: string[] = [];
  for (const match of text.matchAll(/(?<![\p{L}\d.,])(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?(?![\p{L}])/gu)) {
    const value = Number(match[1].replace(/,/g, ''));
    if (Number.isNaN(value)) continue;
    const scale = { k: 1_000, m: 1_000_000 }[match[2]?.toLowerCase() ?? ''] ?? 1;
    numbers.push(String(value * scale));
  }
  return numbers;
}

/** Everything one role says: the only facts its bullets may use. */
export function roleText(role: RenderedExperience): string {
  const head = [role.title, role.company, role.client, role.location, role.blurb, role.techStack];
  const body = role.achievements.flatMap((a) => [a.bullet, a.problem, a.action, a.result]);
  return [...head, ...body].filter(Boolean).join('\n');
}

/** Everything the resume says: the facts the summary may use. */
export function resumeText(resume: RenderedResume): string {
  const contact = resume.contact;
  return [
    ...Object.values(resume.summaries),
    ...resume.experiences.map(roleText),
    ...resume.experiences.flatMap((role) => [role.from, role.to]),
    ...resume.skills.flatMap((skill) => [skill.name, ...skill.aliases]),
    ...resume.educations.flatMap((e) => [e.institution, e.fullName, e.degree, e.field, e.from, e.to]),
    ...(contact ? [contact.firstName, contact.lastName, contact.location] : []),
  ]
    .filter(Boolean)
    .join('\n');
}

function hasLetter(word: string): boolean {
  return /\p{L}/u.test(word);
}

function looksTechnical(word: string): boolean {
  return /\p{Lu}/u.test(word.slice(1)) || /[.#+\d]/.test(word);
}

/**
 * Whether the source has this word. Plurals match ("API" / "APIs"), and a
 * compound needs only its name-like parts known: "AWS-based" passes on AWS,
 * "GenAI-accelerated" fails on GenAI.
 */
function isKnown(word: string, known: ReadonlySet<string>): boolean {
  const lower = word.toLowerCase();
  if (known.has(lower) || known.has(withoutPossessive(lower))) return true;
  if (known.has(`${lower}s`) || (lower.endsWith('s') && known.has(lower.slice(0, -1)))) return true;

  const parts = word.split(/[/\-.'’]+/).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every(
    (part) =>
      known.has(part.toLowerCase()) || /^\d+$/.test(part) || (/^\p{Ll}+$/u.test(part) && part !== 'js'),
  );
}

function vocabulary(text: string): Set<string> {
  const words = new Set<string>();
  for (const { word } of wordsIn(text)) {
    const lower = word.toLowerCase();
    words.add(lower);
    words.add(withoutPossessive(lower));
    for (const part of lower.split(/[/\-.'’]+/)) if (part) words.add(part);
  }
  return words;
}

function withoutPossessive(word: string): string {
  return word.replace(/['’]s$/, '');
}

const WORD = /[\p{L}\p{N}#+][\p{L}\p{N}.#+/'’-]*[\p{L}\p{N}#+]|[\p{L}\p{N}]/gu;

function wordsIn(text: string): Array<{ word: string; sentenceStart: boolean }> {
  return [...text.matchAll(WORD)].map((match) => {
    const before = text.slice(0, match.index).replace(/[\s"'“”‘’([*_]+$/u, '');
    return { word: match[0], sentenceStart: before === '' || /[.!?:;•\n—–-]$/.test(before) };
  });
}
