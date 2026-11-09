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
}
