import type { RenderedResume } from './resume';
import { withoutDashPunctuation } from './cv-writing-guide';
import { experienceSpan } from './cv-writing-guide';

/**
 * The checks a written summary must pass before it is shown (the "Checks to
 * run in code" of the summary instructions). The model can break rules it was
 * given, so each rule is verified here, one function per check.
 */

/** The candidate's record as the summary writer reads it, and per employer for the lookups. */
export interface ExperienceRecord {
  /** Everything, as sent in <experience>. */
  text: string;
  /** Each employer's (or project's) own text: roles, descriptions, bullets, tech stack. */
  employers: Array<{ employer: string; text: string }>;
  /** Technology names the record knows: the skills section and every tech stack line. */
  technologies: string[];
}

export interface CheckResult {
  id: string;
  name: string;
  ok: boolean;
  /** What failed, for the person and for the model's fix. */
  detail?: string;
}

const escapeTerm = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whether the text names the term as a whole word ("Go" is not in "Google"). */
const names = (text: string, term: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeTerm(term.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(text);
/** Whether the text holds the number on its own ("16" is not in "160" or "2016"). */
const holdsNumber = (text: string, number: string) =>
  new RegExp(`(?<![\\d.,])${escapeTerm(number)}(?![\\d]|[.,]\\d)`).test(text);

/** The summary without its bold markers. */
export const plain = (summary: string) => summary.replace(/\*\*/g, '');

export const wordsOf = (text: string) =>
  plain(text)
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));

/** Sentences end at . ! or ? followed by a space and a capital, digit or bold marker. */
export function sentencesOf(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\d*"“(])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Clauses split on , ; : and sentence ends ("1,000" stays whole). */
export function clausesOf(text: string): string[] {
  return sentencesOf(text)
    .flatMap((sentence) => sentence.split(/[,;:](?=\s)/))
    .map((clause) => clause.trim())
    .filter(Boolean);
}

/** The numbers written in a text: "16", "99.9", "1,000". */
export const numbersOf = (text: string) => plain(text).match(/\d+(?:[.,]\d+)*/g) ?? [];

/** The bolded terms: "**Kafka**" gives "Kafka". */
export const boldedOf = (summary: string) =>
  [...summary.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1].trim()).filter(Boolean);

// ── 1 to 10 ──────────────────────────────────────────────────────────────────

/** 1. Between 80 and 120 words. */
export function checkWordCount(summary: string): CheckResult {
  const count = wordsOf(summary).length;
  return {
    id: 'word-count',
    name: 'Word count',
    ok: count >= 80 && count <= 120,
    ...(count < 80 || count > 120 ? { detail: `${count} words; it must be 80 to 120.` } : {}),
  };
}

/** 2. 3 or 4 sentences, each at most 35 words. */
export function checkSentences(summary: string): CheckResult {
  const sentences = sentencesOf(plain(summary));
  const long = sentences
    .map((sentence, index) => ({ index, count: wordsOf(sentence).length }))
    .filter((sentence) => sentence.count > 35);
  const problems = [
    ...(sentences.length < 3 || sentences.length > 4
      ? [`${sentences.length} sentences; it must be 3 or 4`]
      : []),
    ...long.map((sentence) => `sentence ${sentence.index + 1} has ${sentence.count} words (at most 35)`),
  ];
  return {
    id: 'sentences',
    name: 'Sentence count and length',
    ok: !problems.length,
    ...(problems.length ? { detail: `${problems.join('; ')}.` } : {}),
  };
}

/** 3. The first sentence names a job title (engineer, developer, architect) and the years. */
export function checkOpening(summary: string): CheckResult {
  const first = sentencesOf(plain(summary))[0] ?? '';
  const title = /\b(engineer|developer|architect)\b/i.test(first);
  const years = /\byears?\b/i.test(first);
  return {
    id: 'opening',
    name: 'Opening sentence',
    ok: title && years,
    ...(title && years
      ? {}
      : {
          detail: `The first sentence lacks ${[!title && 'a job title (engineer, developer or architect)', !years && '"years"'].filter(Boolean).join(' and ')}.`,
        }),
  };
}

/** 4. No dashes used as sentence punctuation. */
export function checkNoEmDash(summary: string): CheckResult {
  const changed = withoutDashPunctuation(summary) !== summary;
  return {
    id: 'em-dash',
    name: 'No dash punctuation',
    ok: !changed,
    ...(changed ? { detail: 'Replace sentence dashes with commas, colons or a new sentence.' } : {}),
  };
}

/** Words that end in "-ise" in US spelling too. */
const ISE_ALLOWED = [
  'advise',
  'expertise',
  'enterprise',
  'exercise',
  'otherwise',
  'comprise',
  'precise',
  'promise',
  'raise',
  'rise',
  'wise',
  'noise',
  'surprise',
  'premise',
  'advertise',
  'arise',
  'compromise',
  'concise',
  'cruise',
  'demise',
  'devise',
  'disguise',
  'franchise',
  'improvise',
  'likewise',
  'merchandise',
  'paradise',
  'poise',
  'praise',
  'revise',
  'supervise',
  'televise',
  'treatise',
  'clockwise',
  'excise',
  'despise',
  'chastise',
  'incise',
  'bruise',
  'anise',
  'mise',
];
const allowedIse = (word: string) =>
  ISE_ALLOWED.some((base) => {
    if (word === base) return true;
    const stem = base.replace(/e$/, '');
    return (
      word.startsWith(stem) &&
      ['e', 'ed', 'es', 'ing', 'er', 'ers', 'ment', 'ments'].includes(word.slice(stem.length))
    );
  });

/** 5. No British "-ise" or "-isation" spellings ("optimise", "normalisation"). */
export function checkUsSpelling(summary: string): CheckResult {
  const british = [...plain(summary).matchAll(/\b\w+(?:is(?:e|ed|es|ing)|isations?)\b/gi)]
    .map((match) => match[0])
    .filter((word) => !allowedIse(word.toLowerCase()));
  return {
    id: 'us-spelling',
    name: 'US spelling',
    ok: !british.length,
    ...(british.length
      ? { detail: `British spelling: ${[...new Set(british)].join(', ')}. Use -ize and -ization.` }
      : {}),
  };
}

/** 6. No codebase counts: "135 models", "200 migrations", "40 components", "12 packages". */
export function checkNoCodebaseCounts(summary: string): CheckResult {
  const found = [
    ...plain(summary).matchAll(
      /\b\d+(?:[.,]\d+)*\+?[\s-]+(?:[\p{L}.-]+\s+)?(?:models?|migrations?|components?|packages?)\b/giu,
    ),
  ].map((match) => match[0]);
  return {
    id: 'codebase-counts',
    name: 'No schema or codebase counts',
    ok: !found.length,
    ...(found.length ? { detail: `Codebase counts: ${found.join(', ')}.` } : {}),
  };
}

/** 7. Every bolded technology appears in the experience record. */
export function checkBoldedInRecord(summary: string, record: ExperienceRecord): CheckResult {
  const missing = boldedOf(summary).filter((term) => !names(record.text, term));
  return {
    id: 'bold-in-record',
    name: 'Bolded technologies are in the record',
    ok: !missing.length,
    ...(missing.length
      ? { detail: `Not in the experience record: ${[...new Set(missing)].join(', ')}.` }
      : {}),
  };
}

/** 8. Every number in the summary appears in the experience record. */
export function checkNumbersInRecord(summary: string, record: ExperienceRecord): CheckResult {
  const missing = numbersOf(summary).filter((number) => !holdsNumber(record.text, number));
  return {
    id: 'numbers-in-record',
    name: 'Numbers are in the record',
    ok: !missing.length,
    ...(missing.length
      ? { detail: `Not in the experience record: ${[...new Set(missing)].join(', ')}.` }
      : {}),
  };
}

/**
 * Which employer(s) each technology and number sits under in the record. A
 * term under every employer (or nearly every one, with 4 or more) is a
 * general skill, such as TypeScript or Node.js, and is left out.
 */
export function employerLookup(
  record: ExperienceRecord,
): (term: string, number?: boolean) => string[] | null {
  const cache = new Map<string, string[] | null>();
  return (term, number = false) => {
    const key = `${number ? '#' : ''}${term.toLowerCase()}`;
    if (!cache.has(key)) {
      const under = record.employers
        .filter((entry) => (number ? holdsNumber(entry.text, term) : names(entry.text, term)))
        .map((entry) => entry.employer);
      const total = record.employers.length;
      const general = total >= 2 && (under.length === total || (total >= 4 && under.length >= total * 0.75));
      cache.set(key, under.length && !general ? [...new Set(under)] : null);
    }
    return cache.get(key)!;
  };
}

/** The technologies a clause names: the record's own names and the summary's bolded terms. */
function termsIn(clause: string, terms: string[]): string[] {
  const found = terms.filter((term) => names(clause, term));
  // "AWS Lambda" counts once, not also as "AWS".
  return found.filter(
    (term) => !found.some((other) => other !== term && other.length > term.length && names(other, term)),
  );
}

/** 9. One employer per clause: a clause never mixes facts from 2 or more employers. */
export function checkOneEmployerPerClause(summary: string, record: ExperienceRecord): CheckResult {
  const lookup = employerLookup(record);
  const terms = [...new Set([...record.technologies, ...boldedOf(summary)])];
  const mixed: string[] = [];
  for (const clause of clausesOf(plain(summary))) {
    const items = [
      ...termsIn(clause, terms).map((term) => ({ term, under: lookup(term) })),
      ...numbersOf(clause).map((number) => ({ term: number, under: lookup(number, true) })),
    ].filter((item): item is { term: string; under: string[] } => item.under !== null);
    if (items.length < 2) continue;
    const shared = items.reduce<string[]>(
      (common, item) => common.filter((employer) => item.under.includes(employer)),
      items[0].under,
    );
    if (!shared.length)
      mixed.push(`"${clause}" (${items.map((item) => `${item.term}: ${item.under.join('/')}`).join('; ')})`);
  }
  return {
    id: 'one-employer-per-clause',
    name: 'One employer per clause',
    ok: !mixed.length,
    ...(mixed.length ? { detail: `Clauses mixing employers: ${mixed.join(' | ')}.` } : {}),
  };
}

/** 10. No sentence ends in a list of 3 or more tools with no result. */
export function checkNoToolListEnding(summary: string, record: ExperienceRecord): CheckResult {
  const terms = [...new Set([...record.technologies, ...boldedOf(summary)])];
  const isTool = (part: string) => terms.some((term) => part.toLowerCase() === term.toLowerCase());
  const endsWithTool = (part: string) =>
    terms.some((term) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeTerm(term)}$`, 'iu').test(part));
  const endings: string[] = [];
  for (const sentence of sentencesOf(plain(summary))) {
    const parts = sentence
      .replace(/[.!?]+$/, '')
      .replace(/,?\s+(?:and|&)\s+/g, ', ')
      .split(/,\s+/)
      .map((part) => part.trim());
    let count = 0;
    let hasNumber = false;
    for (let index = parts.length - 1; index >= 0; index--) {
      const part = parts[index];
      if (isTool(part)) {
        count++;
        hasNumber ||= /\d/.test(part);
        continue;
      }
      // The list's first item follows its lead-in: "tested with Jest".
      if (endsWithTool(part)) count++;
      break;
    }
    if (count >= 3 && !hasNumber) endings.push(`"${sentence}"`);
  }
  return {
    id: 'tool-list-ending',
    name: 'No sentence ends in a tool list',
    ok: !endings.length,
    ...(endings.length
      ? {
          detail: `Ends in a list of tools: ${endings.join(' | ')}. Lead with the result; tools belong in Skills.`,
        }
      : {}),
  };
}

/** All 10, in order. */
/**
 * What the code can put right without asking the AI again: an em dash becomes
 * a comma, British -ise/-isation spelling becomes -ize/-ization, and a bolded
 * term the record does not name loses its bold. Each would otherwise cost a
 * whole fix round (12 to 17 seconds) for a mechanical change.
 */
export function repairSummary(summary: string, record: ExperienceRecord): string {
  let text = withoutDashPunctuation(summary);
  text = text.replace(/\b(\w+?)is(e|ed|es|ing)\b/gi, (word: string, stem: string, ending: string) =>
    allowedIse(word.toLowerCase()) ? word : `${stem}iz${ending}`,
  );
  text = text.replace(/\b(\w+?)isation(s?)\b/gi, (word: string, stem: string, plural: string) =>
    allowedIse(word.toLowerCase()) ? word : `${stem}ization${plural}`,
  );
  text = text.replace(/\*\*([^*]+)\*\*/g, (whole: string, term: string) =>
    names(record.text, term) ? whole : term,
  );
  return text;
}

export function runSummaryChecks(summary: string, record: ExperienceRecord): CheckResult[] {
  return [
    checkWordCount(summary),
    checkSentences(summary),
    checkOpening(summary),
    checkNoEmDash(summary),
    checkUsSpelling(summary),
    checkNoCodebaseCounts(summary),
    checkBoldedInRecord(summary, record),
    checkNumbersInRecord(summary, record),
    checkOneEmployerPerClause(summary, record),
    checkNoToolListEnding(summary, record),
  ];
}

// ── the record ───────────────────────────────────────────────────────────────

const STACK_LINE = /^\s*(?:tech(?:nology)? stack|stack|technologies|tools)\s*:\s*/i;

/** The names in a "Tech stack: Node.js | Redis | Docker" line. */
const stackItems = (line: string) =>
  line
    .replace(STACK_LINE, '')
    .split(/\s*[|,;]\s*/)
    .map((item) => item.replace(/\.$/, '').trim())
    .filter((item) => item && item.length <= 40);

/** The experience record sent to the summary writer, and its per-employer parts for the checks. */
export function experienceRecord(resume: RenderedResume, now = new Date()): ExperienceRecord {
  const employers: ExperienceRecord['employers'] = [];
  const technologies = new Set<string>();
  const parts: string[] = [];
  const span = experienceSpan(resume, now);
  if (span) parts.push(span);

  for (const role of resume.experiences) {
    const employer = role.company || role.title || 'Employer';
    const lines = [
      `Description: ${role.blurb ?? ''}`.trim(),
      ...role.achievements.map((achievement) => `- ${achievement.bullet}`),
      role.techStack?.trim() ? `Tech stack: ${role.techStack.trim()}` : '',
    ].filter((line) => line && line !== 'Description:');
    for (const achievement of role.achievements)
      if (STACK_LINE.test(achievement.bullet))
        stackItems(achievement.bullet).forEach((item) => technologies.add(item));
    if (role.techStack?.trim())
      stackItems(`Tech stack: ${role.techStack}`).forEach((item) => technologies.add(item));
    const body = [role.title, ...lines].join('\n');
    employers.push({ employer, text: body });
    const dates = `${monthYearOf(role.from)} - ${role.current ? 'present' : monthYearOf(role.to)}`;
    parts.push(
      `<role employer="${attr(employer)}" title="${attr(role.title)}"${role.client ? ` client="${attr(role.client)}"` : ''} dates="${attr(dates)}"${role.location ? ` location="${attr(role.location)}"` : ''}>\n${lines.join('\n')}\n</role>`,
    );
  }
  for (const project of resume.projects ?? []) {
    const lines = project.bullets.map((bullet) => `- ${bullet}`);
    employers.push({ employer: project.name, text: [project.name, project.role ?? '', ...lines].join('\n') });
    parts.push(
      `<project name="${attr(project.name)}"${project.role ? ` role="${attr(project.role)}"` : ''}>\n${lines.join('\n')}\n</project>`,
    );
  }
  const skillLines = new Map<string, string[]>();
  for (const skill of resume.skills) {
    if (!skill.name.trim()) continue;
    technologies.add(skill.name.trim());
    const category = skill.category.trim() || 'Skills';
    skillLines.set(category, [...(skillLines.get(category) ?? []), skill.name.trim()]);
  }
  if (skillLines.size)
    parts.push(
      `Skills:\n${[...skillLines].map(([category, list]) => `${category}: ${list.join(', ')}`).join('\n')}`,
    );
  const education = resume.educations.map((row) =>
    [row.degree, row.field, row.institution].filter(Boolean).join(', '),
  );
  if (education.length) parts.push(`Education:\n${education.join('\n')}`);
  const certifications = (resume.certifications ?? []).map((item) =>
    [item.name, item.issuer].filter(Boolean).join(', '),
  );
  if (certifications.length) parts.push(`Certifications:\n${certifications.join('\n')}`);

  return { text: parts.join('\n\n'), employers, technologies: [...technologies] };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2024-10" → "Oct 2024"; anything else as written. */
function monthYearOf(value?: string | null): string {
  const text = (value ?? '').trim();
  const match = /^(\d{4})-(\d{1,2})/.exec(text);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : text;
}

function attr(text: string): string {
  return text.replace(/"/g, "'");
}
