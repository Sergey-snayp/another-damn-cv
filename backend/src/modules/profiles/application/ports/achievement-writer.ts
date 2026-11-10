import type { AchievementDraft, AchievementSource } from '../../domain/achievements';

export interface AssistInput {
  source: AchievementSource;
  /** "improve": rewrite `text`; "write": a new bullet from `text` (rough words, maybe empty). */
  mode: 'improve' | 'write';
  text: string;
  /** Up to 3 words to work in where the facts support them. */
  keywords: string[];
  instruction: string;
  /** "Coach Me": the task the person did and what it changed, in their words. */
  coach?: { task: string; impacts: string[]; amount: string; period: string };
}

/** Per job: words worth working into its bullets, and the tasks such a job has, for the person to pick. */
export interface AssistSuggestions {
  keywords: string[];
  tasks: string[];
}

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
  /** 3 versions of one bullet (improve) or 3 drafts of a new one (write), each from another angle. */
  assist(input: AssistInput): Promise<{ angle: string; text: string }[]>;
  /** Keywords and tasks for one job, from its description, bullets and tech stack. */
  suggest(source: AchievementSource): Promise<AssistSuggestions>;
  /** One achievement too long for a CV line, as 2 to 4 shorter ones that each stand alone. */
  split(input: { source: AchievementSource; text: string }): Promise<string[]>;
}
