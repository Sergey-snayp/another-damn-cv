/**
 * The guard for a reworded CV line: every word that carries meaning must come
 * from the line itself (or the job it belongs to), or be a posting word the
 * line is known to show. "adding 4,000+" must not become "scaling to 4,000+",
 * and "ad auctions" must not become "transaction processing".
 *
 * `unsupportedClaims` catches new names and numbers. This catches new plain
 * words, which is how a rewrite usually changes a meaning.
 */
import { withoutMarks } from '../text-marks';
import { numbersIn, unsupportedClaims } from './claims';

/** Words that join a sentence and say nothing about the work. */
const LINKING = new Set(
  `a an and as at be been both but by each for from had has have in including into is it its of on or our over per
  so such than that the their them then these this those through to under up was were when where which while who
  with within without across along also among around based between during using via
  use used uses`.split(/\s+/),
);

/** Plain verbs for "made it": swapping one for another claims nothing new. Not "led", "owned" or "scaled". */
const SAME_WORK = new Set(
  'build built building builds develop developed developing create created creating implement implemented implementing deliver delivered delivering write wrote written writing make made making add added adding'.split(
    ' ',
  ),
);

/** The word without its ending, so "payments", "payment" and "Modelled", "modeled" count as one. */
function stem(word: string): string {
  let base = word.replace(/['’]s$/, '');
  if (base.length > 4 && base.endsWith('ies')) base = `${base.slice(0, -3)}y`;
  else if (base.length > 5 && base.endsWith('ing')) base = base.slice(0, -3);
  else if (base.length > 4 && base.endsWith('ed')) base = base.slice(0, -2);
  else if (base.length > 4 && base.endsWith('es')) base = base.slice(0, -2);
  else if (base.length > 3 && base.endsWith('s') && !base.endsWith('ss')) base = base.slice(0, -1);
  if (/([b-df-hj-np-tv-z])\1$/.test(base)) base = base.slice(0, -1);
  return base.length > 3 ? base.replace(/e$/, '') : base;
}

/** The line's words, lower-cased; "event-driven" and "DynamoDB/PostgreSQL" count part by part. */
function wordsOf(text: string): string[] {
  return (
    withoutMarks(text)
      .toLowerCase()
      .match(/[\p{L}\p{N}+#]+(?:['’.][\p{L}\p{N}+#]+)*/gu) ?? []
  ).filter((word) => /\p{L}/u.test(word));
}

const carriesMeaning = (word: string) => word.length > 2 && !LINKING.has(word) && !SAME_WORK.has(word);

/**
 * What a rewrite claims that its source does not: new words and names, and, with
 * `keepNumbers`, any number it dropped. `allowed` holds posting words the line
 * is known to show. Empty means the rewrite is safe to offer.
 */
export function rewriteProblems(
  rewrite: string,
  source: string,
  options: { allowed?: string[]; keepNumbers?: boolean } = {},
): string[] {
  const known = new Set(wordsOf(source).map(stem));
  const allowed = new Set((options.allowed ?? []).flatMap(wordsOf));
  const added = wordsOf(rewrite).filter(
    (word) => carriesMeaning(word) && !known.has(stem(word)) && !allowed.has(word),
  );
  const lost = options.keepNumbers
    ? numbersIn(withoutMarks(source)).filter((number) => !numbersIn(withoutMarks(rewrite)).includes(number))
    : [];
  return [
    ...new Set([...added, ...unsupportedClaims(rewrite, source).map((word) => word.toLowerCase()), ...lost]),
  ];
}
