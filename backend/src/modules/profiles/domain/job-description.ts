/**
 * A job's (or its project's) description on the Profile: one factual sentence
 * of 15 to 25 words saying what the product does, who uses it and its business
 * purpose. Not the person's work, results, technologies, generic claims, or
 * what the job's title and company already say. The same standard the Profile
 * page's description check shows (frontend/src/profile/descriptionCheck.ts).
 */
import { withoutMarks } from './text-marks';

export const DESCRIPTION_WORDS = { min: 15, max: 25 } as const;

const ABOUT_YOU =
  /^\s*(?:built|developed|designed|led|created|implemented|worked|managed|maintained|delivered|responsible|helped|wrote|migrated|owned)\b|\b(?:I|me|my|we|our|us)\b|\bresponsible for\b/i;
const RESULT =
  /\d\s*%|[$€£]\s*\d|\b\d+x\b|\b(?:increased|reduced|improved|saved|cut|grew|boosted|doubled|tripled|decreased|accelerated)\b/i;
const BUZZ =
  /\b(?:innovative|cutting[- ]edge|world[- ]class|best[- ]in[- ]class|state[- ]of[- ]the[- ]art|next[- ]gen(?:eration)?|revolutionary|disruptive|seamless(?:ly)?|leading|award[- ]winning|robust|powerful|unique|dynamic|fast[- ]paced|game[- ]changing)\b/i;

/** The text names this technology as a word of its own ("Go" not in "Google"). */
const names = (text: string, tool: string) =>
  Boolean(tool.trim()) &&
  new RegExp(
    `(^|[^\\p{L}\\p{N}])${tool.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(text);

/** What breaks the standard, in words the AI can be told; empty when it meets it. */
export function descriptionProblems(
  text: string,
  job: { title: string; company: string; techStack: string },
): string[] {
  const line = withoutMarks(text).trim();
  const words = line.split(/\s+/).filter(Boolean).length;
  const problems: string[] = [];
  if (words < DESCRIPTION_WORDS.min - 2 || words > DESCRIPTION_WORDS.max + 3)
    problems.push(`${words} words, not ${DESCRIPTION_WORDS.min} to ${DESCRIPTION_WORDS.max}`);
  if (line.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean).length !== 1) problems.push('more than one sentence');
  const you = ABOUT_YOU.exec(line)?.[0]?.trim();
  if (you) problems.push(`about the person ("${you}"), not the product`);
  const result = RESULT.exec(line)?.[0]?.trim();
  if (result) problems.push(`a result ("${result}")`);
  const buzz = BUZZ.exec(line)?.[0];
  if (buzz) problems.push(`a generic claim ("${buzz}")`);
  const tools = job.techStack
    .split(/[,|;\n]/)
    .map((tool) => tool.trim())
    .filter((tool) => tool && names(line, tool));
  if (tools.length) problems.push(`technologies (${tools.join(', ')})`);
  const repeated = [job.company, job.title].map((name) => name.trim()).find((name) => name.length > 2 && names(line, name));
  if (repeated) problems.push(`repeats "${repeated}" from the title`);
  return problems;
}
