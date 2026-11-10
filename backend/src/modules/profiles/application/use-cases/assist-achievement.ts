import type { AchievementWriter, AssistInput } from '../ports/achievement-writer';
import { ACHIEVEMENT_WORDS, AchievementError, supported, wordCount } from '../../domain/achievements';
import { withoutMarks } from '../../domain/text-marks';

export interface AssistOption {
  /** "Result first", "Technical", "Concise". */
  angle: string;
  text: string;
}

/**
 * "Improve with AI" on a Profile bullet, and "Write with AI" for a new one:
 * 3 versions to choose from, each checked against the person's facts. A version
 * that brings a number or a name they never wrote, or runs past the standard
 * size, is not shown.
 */
export class AssistAchievement {
  constructor(private readonly writer: Pick<AchievementWriter, 'assist'>) {}

  async execute(input: AssistInput): Promise<{ options: AssistOption[] }> {
    const text = withoutMarks(input.text).trim();
    if (input.mode === 'improve' && !text) throw new AchievementError('Write the bullet first.');
    // The facts a version may use: this bullet (or the words written), the job, and the keywords chosen.
    const facts = [
      input.source.title,
      input.source.company,
      input.source.client,
      input.source.description,
      text,
      ...input.keywords,
    ].join('\n');
    const raw = await this.writer.assist({ ...input, text });
    const options: AssistOption[] = [];
    for (const option of raw) {
      const line = option.text.replace(/\s+/g, ' ').trim();
      if (line.length < 8 || wordCount(line) > ACHIEVEMENT_WORDS + 5) continue;
      if (!supported(line, facts)) continue;
      if (options.some((kept) => kept.text === line) || line === text) continue;
      options.push({ angle: option.angle.trim().slice(0, 40) || 'Option', text: line });
    }
    if (!options.length)
      throw new AchievementError(
        input.mode === 'improve'
          ? "Couldn't improve this bullet without adding facts it doesn't have. Add a detail, or try again."
          : 'Write a few words about what you did, then try again.',
      );
    return { options: options.slice(0, 3) };
  }
}
