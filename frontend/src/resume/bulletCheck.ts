/**
 * One bullet against the standard a recruiter's checker holds it to: 20 to 40
 * words, an action verb first, a number, a time frame, and the job's keywords.
 * Plain rules, no AI: instant, and the same for every line.
 */

export const BULLET_WORDS = { min: 20, max: 40 } as const;

export interface BulletCheck {
  words: number;
  characters: number;
  /** "short", "good" or "long" against BULLET_WORDS. */
  length: 'short' | 'good' | 'long';
  actionVerb: boolean;
  metric: boolean;
  time: boolean;
  /** The keywords given that the line uses; null when none were given. */
  keywords: { used: string[]; total: number } | null;
}

/** Past-tense verbs that do not end in "-ed". */
const IRREGULAR = new Set(
  'built led ran wrote drove made cut grew won set took brought taught oversaw began rebuilt rewrote shipped sped spun split held kept found gave got hit laid lent met paid put read sent shot sold stood struck swept thought threw upheld withdrew undertook'.split(
    ' ',
  ),
);
/** "-ed" words that are not actions. */
const NOT_ACTIONS = new Set('used based tasked responsible involved exposed experienced skilled'.split(' '));

/** Digits as a count or amount; digits inside a name (Route53, EC2, 3-D) are not. */
const NUMBER = /(?<![A-Za-z\d.-])(?:[$€£]\s?)?\d[\d,]*(?:\.\d+)?\s*(?:%|[kKmMbB]\b|\+)?(?![A-Za-z\d-])/;
const NUMBER_WORDS = /\b(?:two|three|four|five|six|seven|eight|nine|ten|twelve|dozens?|hundreds?|thousands?|millions?|billions?|half|double|doubled|tripled)\b/i;
const TIME =
  /\b(?:daily|weekly|monthly|quarterly|yearly|annually|hourly|nightly|each (?:day|week|month|quarter|year|night|morning|sprint|release)|every (?:day|week|month|quarter|year|night|morning|sprint|release)|(?:a|per) (?:day|week|month|quarter|year|hour|minute|second)|\d[\d,.]*\+?\s*(?:ms|milliseconds?|seconds?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|quarters?|years?)|(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|several|a few) (?:seconds?|minutes?|hours?|days?|weeks?|months?|quarters?|years?)|ahead of schedule|on schedule|real[- ]time|overnight|still in (?:production|use))\b/i;

const wordsOf = (text: string) => text.replace(/\*\*/g, '').trim().split(/\s+/).filter(Boolean);

export const isActionVerb = (word: string) => {
  const bare = word.toLowerCase().replace(/[^a-z-]/g, '');
  return IRREGULAR.has(bare) || (/^[a-z-]{3,}ed$/.test(bare) && !NOT_ACTIONS.has(bare));
};

/** A keyword is used when the line names it, ignoring case and punctuation ("Node.js" = "NodeJS"). */
const flat = (text: string) => ` ${text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9+#]+/g, ' ').trim()} `;
export const usesKeyword = (line: string, keyword: string) => {
  const name = flat(keyword).trim();
  if (!name) return false;
  const text = flat(line);
  return [name, name.replace(/\s+/g, '')].some((form) => text.includes(` ${form} `) || text.includes(` ${form}s `));
};

export function checkBullet(text: string, keywords?: string[]): BulletCheck {
  const words = wordsOf(text);
  const plain = text.replace(/\*\*/g, '').trim();
  const list = [...new Set((keywords ?? []).map((keyword) => keyword.trim()).filter(Boolean))];
  return {
    words: words.length,
    characters: plain.length,
    length: words.length < BULLET_WORDS.min ? 'short' : words.length > BULLET_WORDS.max ? 'long' : 'good',
    actionVerb: Boolean(words[0] && isActionVerb(words[0])),
    metric: NUMBER.test(plain) || NUMBER_WORDS.test(plain),
    time: TIME.test(plain),
    keywords: keywords ? { used: list.filter((keyword) => usesKeyword(plain, keyword)), total: list.length } : null,
  };
}

/** The follow-up question that would fill a missing part. */
export const QUESTIONS = {
  metric: 'About how many or how much? (users, requests, services, people, %, $)',
  time: 'Over how long, or how often? (in 3 months, daily, still in production)',
} as const;
