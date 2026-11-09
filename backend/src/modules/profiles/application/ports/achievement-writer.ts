import type { AchievementDraft, AchievementSource } from '../../domain/achievements';

/** Writes achievements for one job from the person's notes. */
export interface AchievementWriter {
  draft(source: AchievementSource): Promise<AchievementDraft>;
}
