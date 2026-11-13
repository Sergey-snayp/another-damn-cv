import type { AchievementWriter } from '../ports/achievement-writer';
import { AchievementError, supported, unknownNames, type AchievementSource } from '../../domain/achievements';
import { descriptionProblems } from '../../domain/job-description';
import { withoutMarks } from '../../domain/text-marks';
import type { AssistOption } from './assist-achievement';

export interface AssistDescriptionInput {
  source: AchievementSource;
  /** The description as written now; empty to write one. */
  text: string;
  /** Answers to the questions an earlier try asked. */
  answers: { question: string; answer: string }[];
  instruction: string;
}

/**
 * "Write with AI" for a job's description: 3 one-sentence versions of what the
 * product is, who uses it and why, each checked; or, when the job's facts don't
 * say enough, the questions to answer first. A version with a fact the job
 * doesn't have, or that breaks the description standard, is not shown.
 */
export class AssistDescription {
  constructor(private readonly writer: Pick<AchievementWriter, 'describe'>) {}

  async execute(input: AssistDescriptionInput): Promise<{ options: AssistOption[]; questions: string[] }> {
    const text = withoutMarks(input.text).trim();
    const { source } = input;
    const known = [
      source.title,
      source.company,
      source.client,
      source.description,
      ...source.bullets,
      source.notes,
      text,
      ...input.answers.flatMap((item) => [item.question, item.answer]),
      input.instruction,
    ].join('\n');
    const ask = (avoid: string[]) =>
      this.writer.describe({ source, text, answers: input.answers, instruction: input.instruction, avoid });
    let first = await ask([]);
    let kept = this.checked(first.options, source, known, text);
    if (!kept.options.length && !first.questions.length && kept.problems.length) {
      first = await ask(kept.problems);
      kept = this.checked(first.options, source, known, text);
    }
    if (kept.options.length) return { options: kept.options.slice(0, 3), questions: [] };
    if (first.questions.length) return { options: [], questions: first.questions };
    throw new AchievementError(
      "Couldn't write a description from this job's facts without guessing. Add a few words about the product and try again.",
    );
  }

  private checked(raw: { angle: string; text: string }[], source: AchievementSource, known: string, text: string) {
    const options: AssistOption[] = [];
    const problems = new Set<string>();
    for (const option of raw) {
      const line = option.text.replace(/\s+/g, ' ').trim();
      if (!line || line === text) continue;
      if (!supported(line, known)) {
        for (const name of unknownNames(line, known)) problems.add(`"${name}" is not in the job's facts`);
        problems.add('a number or name the job does not have');
        continue;
      }
      const broken = descriptionProblems(line, source);
      if (broken.length) {
        for (const problem of broken) problems.add(problem);
        continue;
      }
      options.push({ angle: option.angle.trim().slice(0, 40) || 'Option', text: line, keywords: [], placeholders: [] });
    }
    return { options, problems: [...problems] };
  }
}
