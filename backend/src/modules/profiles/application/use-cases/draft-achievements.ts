import type { AchievementWriter } from '../ports/achievement-writer';
import {
  checkProposal,
  tooLong,
  type AchievementProposal,
  type AchievementSource,
} from '../../domain/achievements';
import { SplitAchievement } from './split-achievement';

/**
 * "Turn into bullets" on a Profile job: the AI's proposal, checked. Nothing is
 * saved here; the person keeps, edits or drops each line, then Profile saves.
 * A line longer than the standard size comes back as 2 to 4 that fit it.
 */
export class DraftAchievements {
  private readonly splitter: SplitAchievement;
  constructor(private readonly writer: AchievementWriter) {
    this.splitter = new SplitAchievement(writer);
  }
  async execute(source: AchievementSource): Promise<AchievementProposal> {
    const draft = await this.writer.draft(source);
    const achievements = await Promise.all(
      draft.achievements.map(async (item) => {
        if (!tooLong(item.text)) return [item];
        const { parts } = await this.splitter.execute({ source, text: item.text });
        // Its questions stay with the first part, which names the work.
        return parts.map((text, index) => ({ text, asks: index === 0 ? item.asks : [] }));
      }),
    );
    return checkProposal({ ...draft, achievements: achievements.flat() }, source);
  }
}
