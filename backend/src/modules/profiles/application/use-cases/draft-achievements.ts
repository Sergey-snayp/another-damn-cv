import type { AchievementWriter } from '../ports/achievement-writer';
import { checkProposal, type AchievementProposal, type AchievementSource } from '../../domain/achievements';

/**
 * "Turn into bullets" on a Profile job: the AI's proposal, checked. Nothing is
 * saved here; the person keeps, edits or drops each line, then Profile saves.
 */
export class DraftAchievements {
  constructor(private readonly writer: AchievementWriter) {}
  async execute(source: AchievementSource): Promise<AchievementProposal> {
    return checkProposal(await this.writer.draft(source), source);
  }
}
