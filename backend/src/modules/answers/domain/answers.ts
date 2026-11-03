/**
 * Saved answers to application questions, and how a form's questions find them.
 *
 * Matching checks words, not meaning. The same question (ignoring case,
 * punctuation and "Required") fills as is. Similar wording fills too, marked so
 * the person checks it. Anything else is a new question.
 */

export interface SavedAnswer {
  id: string;
  question: string;
  answer: string;
  company: string | null;
  usedCount: number;
  lastUsedAt: Date | null;
  updatedAt: Date;
}

export const QUESTION_KINDS = [
  'text',
  'textarea',
  'number',
  'select',
  'radio',
  'checkbox',
  'combobox',
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** A question on the form being filled; `id` is the extension's handle for it. */
export interface FormQuestion {
  id: string;
  question: string;
  kind: QuestionKind;
  options?: string[];
}

export interface AnswerMatch {
  id: string;
  answerId: string;
  /** The value to put in the field: the option text for choices. */
  value: string;
  match: 'exact' | 'similar';
  savedQuestion: string;
}

export interface SkippedAnswer {
  id: string;
  savedQuestion: string;
  reason: 'names-another-company' | 'no-matching-option';
}

export class AnswerNotFoundError extends Error {
  constructor() {
    super('No such saved answer.');
    this.name = 'AnswerNotFoundError';
  }
}

const normal = (text: string) =>
  text
    .toLowerCase()
    .replace(/\brequired\b|\(optional\)|\*/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The exact-match key: "Telegram account *" and "telegram account" share one. */
export function questionKey(question: string): string {
  return normal(question).replace(/\s+/g, ' ').slice(0, 500);
}

const STOP = new Set(
  'a an the and or of to in on for with at by from your you yours are is am be do does did have has what which who how many much please enter provide if yes no any our we us this that there it its i my me can could would will about'.split(
    ' ',
  ),
);
const stem = (word: string) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);
function words(question: string): Set<string> {
  return new Set(
    normal(question)
      .split(/\s+/)
      .filter((word) => word && !STOP.has(word))
      .map(stem),
  );
}

/**
 * Share of the shorter question's meaningful words found in the other. 1 for
 * "Telegram account" and "Your Telegram"; 2/3 for "experience in iGaming" and
 * "experience in fintech", which is not enough.
 */
export function similarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.min(left.size, right.size);
}

export const SIMILAR_ENOUGH = 0.8;

/** The option a saved choice answer selects, or null when the form offers none of it. */
function optionFor(answer: string, options: string[]): string | null {
  const wanted = questionKey(answer);
  return (
    options.find((option) => questionKey(option) === wanted) ??
    options.find((option) => {
      const text = questionKey(option);
      return text.length > 1 && (text.includes(wanted) || wanted.includes(text));
    }) ??
    null
  );
}

/** True when the answer names the company it was written for, and this is another one. */
function namesAnotherCompany(saved: SavedAnswer, company: string | undefined): boolean {
  if (!saved.company) return false;
  const writtenFor = questionKey(saved.company);
  if (!writtenFor || !` ${questionKey(saved.answer)} `.includes(` ${writtenFor} `)) return false;
  return !questionKey(company ?? '').includes(writtenFor);
}

export function matchAnswers(
  questions: FormQuestion[],
  saved: SavedAnswer[],
  company?: string,
): { matches: AnswerMatch[]; skipped: SkippedAnswer[] } {
  const byKey = new Map(saved.map((answer) => [questionKey(answer.question), answer]));
  const matches: AnswerMatch[] = [];
  const skipped: SkippedAnswer[] = [];
  for (const question of questions) {
    let found = byKey.get(questionKey(question.question));
    let match: AnswerMatch['match'] = 'exact';
    if (!found) {
      const ranked = saved
        .map((answer) => ({ answer, score: similarity(question.question, answer.question) }))
        .filter((entry) => entry.score >= SIMILAR_ENOUGH)
        .sort((a, b) => b.score - a.score || b.answer.updatedAt.getTime() - a.answer.updatedAt.getTime());
      found = ranked[0]?.answer;
      match = 'similar';
    }
    if (!found) continue;
    if (namesAnotherCompany(found, company)) {
      skipped.push({ id: question.id, savedQuestion: found.question, reason: 'names-another-company' });
      continue;
    }
    let value = found.answer;
    if ((question.kind === 'select' || question.kind === 'radio') && question.options?.length) {
      const option = optionFor(found.answer, question.options);
      if (!option) {
        skipped.push({ id: question.id, savedQuestion: found.question, reason: 'no-matching-option' });
        continue;
      }
      value = option;
    }
    matches.push({ id: question.id, answerId: found.id, value, match, savedQuestion: found.question });
  }
  return { matches, skipped };
}
