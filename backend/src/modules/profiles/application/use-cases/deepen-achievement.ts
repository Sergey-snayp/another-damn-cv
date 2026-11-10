import type { AchievementWriter, DeepenInput } from '../ports/achievement-writer';
import { supported, tooLong, unknownNames } from '../../domain/achievements';
import { SplitAchievement } from './split-achievement';

/**
 * "Rewrite with my answers" on one proposed achievement: the line filled out
 * with the person's answers to its follow-up questions. A rewrite that brings a
 * number or a name the person never wrote is not shown: the line stays as it was.
 * Grown past the standard size, it comes back split: `text` and `more`.
 */
export class DeepenAchievement {
  constructor(private readonly writer: Pick<AchievementWriter, 'deepen' | 'split'>) {}
  async execute(
    input: DeepenInput,
  ): Promise<{ text: string; more: string[]; asks: string[]; changed: boolean }> {
    const answers = input.answers.filter((item) => item.answer.trim());
    if (!answers.length) return { text: input.text, more: [], asks: [], changed: false };
    // Only the line and the answers may add to it: other work from the notes stays out.
    const facts = [
      input.source.title,
      input.source.company,
      input.source.client,
      input.text,
      ...answers.map((item) => item.answer),
    ].join('\n');
    const check = (raw: string) => {
      const sentences =
        raw
          .replace(/\s+/g, ' ')
          .trim()
          .match(/[^.!?]+(?:[.!?]+|$)/g) ?? [];
      const kept: string[] = [];
      for (const sentence of sentences) {
        if (!supported(sentence, facts)) break;
        kept.push(sentence.trim());
      }
      return {
        text: kept.join(' '),
        whole: kept.length === sentences.length,
        names: unknownNames(raw, facts),
      };
    };
    let result = await this.writer.deepen({ ...input, answers });
    let checked = check(result.text);
    // A name from other work: once more, told not to use it.
    if (!checked.whole && checked.names.length) {
      result = await this.writer.deepen({ ...input, answers, avoid: checked.names });
      checked = check(result.text);
    }
    // Never shorter than it was: a rewrite that lost part of the line is not used.
    const text = checked.whole || checked.text.length >= input.text.length ? checked.text : '';
    if (text.length < 8 || text.length > 700) return { text: input.text, more: [], asks: [], changed: false };
    const { parts } = tooLong(text)
      ? await new SplitAchievement(this.writer).execute({ source: input.source, text })
      : { parts: [text] };
    return {
      text: parts[0],
      more: parts.slice(1),
      asks: result.asks.slice(0, 1),
      changed: text !== input.text,
    };
  }
}
