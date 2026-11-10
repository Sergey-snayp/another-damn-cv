import type { AchievementWriter, AssistInput } from '../ports/achievement-writer';
import {
  ACHIEVEMENT_WORDS,
  AchievementError,
  mentions,
  supported,
  unknownNames,
  wordCount,
} from '../../domain/achievements';
import { withoutMarks } from '../../domain/text-marks';

export interface AssistOption {
  /** "Result first", "Technical", "Concise". */
  angle: string;
  text: string;
  /** The chosen keywords this version works in, to underline. */
  keywords: string[];
  /** Placeholders ("[X]%", "[N] months") the person fills with their own numbers. */
  placeholders: string[];
}

/** Where a number would help but the person gave none: "[X]", "[N]", "[X]%". */
const PLACEHOLDER = /\[[A-Z]\]/g;
/** Saying one led, managed or mentored is a claim the facts must make. */
const LEADING = /\b(?:led|lead|leading|managed|managing|mentored|mentoring|supervised|headed|directed)\b/i;

/**
 * "Improve with AI" on a Profile bullet, and "Write with AI" for a new one:
 * 3 versions to choose from, each checked against the person's facts. A version
 * that brings a number or a name they never wrote, or runs past the standard
 * size, or claims to have led what the facts never say was led, is not shown.
 * Where a number would help but none was given, a version holds a placeholder.
 */
export class AssistAchievement {
  constructor(private readonly writer: Pick<AchievementWriter, 'assist'>) {}

  async execute(input: AssistInput): Promise<{ options: AssistOption[] }> {
    const text = withoutMarks(input.text).trim();
    if (input.mode === 'improve' && !text) throw new AchievementError('Write the bullet first.');
    // The facts a version may use: this bullet (or the words written), the job, and the keywords chosen.
    const coach = input.coach;
    const facts = [
      input.source.title,
      input.source.company,
      input.source.client,
      input.source.description,
      text,
      ...input.keywords,
      ...(coach ? [coach.task, ...coach.impacts, coach.amount, coach.period] : []),
    ].join('\n');
    let options = this.checked(await this.writer.assist({ ...input, text }), input, text, facts);
    // Every version failed the check: once more, told which names to leave out.
    if (!options.kept.length && options.names.length)
      options = this.checked(
        await this.writer.assist({
          ...input,
          text,
          instruction: [input.instruction, `Do not mention ${options.names.join(', ')}: the facts do not.`]
            .filter(Boolean)
            .join(' '),
        }),
        input,
        text,
        facts,
      );
    const kept = options.kept;
    if (!kept.length)
      throw new AchievementError(
        input.mode === 'improve'
          ? "Couldn't improve this bullet without adding facts it doesn't have. Add a detail, or try again."
          : 'Write a few words about what you did, then try again.',
      );
    return { options: kept.slice(0, 3) };
  }

  /** The versions that pass, best for the chosen keywords first, and the names that failed the rest. */
  private checked(
    raw: { angle: string; text: string }[],
    input: AssistInput,
    text: string,
    facts: string,
  ): { kept: AssistOption[]; names: string[] } {
    const options: AssistOption[] = [];
    const names = new Set<string>();
    for (const option of raw) {
      const line = option.text.replace(/\s+/g, ' ').trim();
      if (line.length < 8 || wordCount(line) > ACHIEVEMENT_WORDS + 5) continue;
      // A placeholder is not a number: the check reads the line without them.
      if (!supported(line.replace(PLACEHOLDER, ''), facts)) {
        for (const name of unknownNames(line.replace(PLACEHOLDER, ''), facts)) names.add(name);
        continue;
      }
      if (LEADING.test(line) && !LEADING.test(facts)) continue;
      if (options.some((kept) => kept.text === line) || line === text) continue;
      options.push({
        angle: option.angle.trim().slice(0, 40) || 'Option',
        text: line,
        keywords: input.keywords.filter((keyword) => mentions(line, keyword)),
        placeholders: [...new Set(line.match(PLACEHOLDER) ?? [])],
      });
    }
    // The versions that work in the most of the chosen keywords come first.
    options.sort((a, b) => b.keywords.length - a.keywords.length);
    return { kept: options, names: [...names] };
  }
}

/** Keywords and tasks for one job's bullets, each short and listed once. */
export class SuggestForJob {
  constructor(private readonly writer: Pick<AchievementWriter, 'suggest'>) {}
  async execute(source: Parameters<AchievementWriter['suggest']>[0]) {
    const tidy = (list: string[], most: number) =>
      [
        ...new Map(
          list
            .map((item) => withoutMarks(item).replace(/\s+/g, ' ').trim())
            .filter((item) => item.length > 1 && item.length <= 60)
            .map((item) => [item.toLowerCase(), item]),
        ).values(),
      ].slice(0, most);
    try {
      const raw = await this.writer.suggest(source);
      return { keywords: tidy(raw.keywords, 12), tasks: tidy(raw.tasks, 10) };
    } catch {
      return { keywords: [], tasks: [] };
    }
  }
}
