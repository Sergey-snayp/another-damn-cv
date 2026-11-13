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

export interface SummaryAssistInput {
  mode: 'improve' | 'write';
  /** The summary as written now (improve), or rough words (write, maybe empty). */
  text: string;
  /** Everything the Profile says, years of experience included. */
  facts: string;
  keywords: string[];
  instruction: string;
}

export interface DescribeInput {
  source: AchievementSource;
  /** The description as written now (improve it), or empty (write one). */
  text: string;
  /** Answers to the questions an earlier try asked. */
  answers: { question: string; answer: string }[];
  instruction: string;
  /** What an earlier try broke, to avoid this time. */
  avoid?: string[];
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
  /** 3 versions of the professional summary (improve the one written, or write one), from the Profile. */
  summary(input: SummaryAssistInput): Promise<{ angle: string; text: string }[]>;
  /**
   * 3 one-sentence descriptions of what a job's product is, or, when the facts are too thin to
   * say it accurately, up to 3 questions for the person instead.
   */
  describe(input: DescribeInput): Promise<{ options: { angle: string; text: string }[]; questions: string[] }>;
  /** Keywords and tasks for one job, from its description, bullets and tech stack. */
  suggest(source: AchievementSource): Promise<AssistSuggestions>;
  /** One achievement too long for a CV line, as 2 to 4 shorter ones that each stand alone. */
  split(input: { source: AchievementSource; text: string }): Promise<string[]>;
}
