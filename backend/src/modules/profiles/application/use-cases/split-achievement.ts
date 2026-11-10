import type { AchievementWriter } from '../ports/achievement-writer';
import {
  ACHIEVEMENT_WORDS,
  supported,
  tooLong,
  wordCount,
  type AchievementSource,
} from '../../domain/achievements';

/**
 * "Split": an achievement longer than the standard size, as 2 to 4 that each
 * fit it. The parts may only hold what the line says; when the AI's split does
 * not pass, the line stays as it was.
 */
export class SplitAchievement {
  constructor(private readonly writer: Pick<AchievementWriter, 'split'>) {}
  async execute(input: { source: AchievementSource; text: string }): Promise<{ parts: string[] }> {
    const text = input.text.replace(/\s+/g, ' ').trim();
    if (!tooLong(text)) return { parts: [text] };
    const facts = [input.source.title, input.source.company, input.source.client, text].join('\n');
    let raw: string[];
    try {
      raw = await this.writer.split({ source: input.source, text });
    } catch {
      return { parts: [text] };
    }
    const parts = raw.map((part) => part.replace(/\s+/g, ' ').trim()).filter((part) => part.length >= 8);
    // A few words over is fine; a part as long as the line is not a split.
    const fits = parts.every((part) => wordCount(part) <= ACHIEVEMENT_WORDS + 5);
    if (parts.length < 2 || parts.length > 4 || !fits || !parts.every((part) => supported(part, facts)))
      return { parts: [text] };
    return { parts };
  }
}
