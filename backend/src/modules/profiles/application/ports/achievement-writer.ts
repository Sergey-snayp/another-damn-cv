import type { AchievementDraft, AchievementSource } from '../../domain/achievements';

export interface DeepenInput {
  source: AchievementSource;
  /** The achievement as it reads now. */
  text: string;
  answers: { question: string; answer: string }[];
  /** Names a first rewrite brought in from other work: not to be used again. */
  avoid?: string[];
}

/** Writes achievements for one job from the person's notes, and fills one out with their answers. */
export interface AchievementWriter {
  draft(source: AchievementSource): Promise<AchievementDraft>;
  deepen(input: DeepenInput): Promise<{ text: string; asks: string[] }>;
  /** Achievements that bring in technologies no line mentions yet, from the facts only. */
  cover(input: {
    source: AchievementSource;
    missing: string[];
    written: string[];
  }): Promise<{ achievements: { text: string; replaces: string }[]; unplaced: string[] }>;
  /** One achievement too long for a CV line, as 2 to 4 shorter ones that each stand alone. */
  split(input: { source: AchievementSource; text: string }): Promise<string[]>;
}
