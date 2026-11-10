import type { AchievementWriter } from '../ports/achievement-writer';
import type { CareerProfileRepository } from '../ports/career-profile';
import { AchievementError, supported, unknownNames } from '../../domain/achievements';
import { profileFacts } from '../../domain/profile-facts';
import { withoutMarks } from '../../domain/text-marks';
import type { AssistOption } from './assist-achievement';

const PLACEHOLDER = /\[[A-Z]\]/g;
const LEADING = /\b(?:led|lead|leading|managed|managing|mentored|mentoring|supervised|headed|directed)\b/i;
const FIRST_PERSON = /\b(?:I|me|my|mine)\b/;
const SUMMARY_WORDS = 130;

/**
 * "Write with AI" / "Improve with AI" for the professional summary: 3 versions
 * written from the whole Profile, each checked against it. A version with a
 * number or a name the Profile does not have, "led" it never says, "I" or
 * "my", or past the length a summary takes, is not shown.
 */
export class AssistSummary {
  constructor(
    private readonly career: Pick<CareerProfileRepository, 'read'>,
    private readonly writer: Pick<AchievementWriter, 'summary'>,
  ) {}

  async execute(
    userId: string,
    input: { mode: 'improve' | 'write'; text: string; keywords: string[]; instruction: string },
  ): Promise<{ options: AssistOption[] }> {
    const state = await this.career.read(userId);
    const roles = state.data.experiences?.value ?? [];
    const skills = state.data.skills?.value ?? [];
    const text = withoutMarks(input.text).trim();
    if (input.mode === 'improve' && !text) throw new AchievementError('Write the summary first.');
    if (!roles.length)
      throw new AchievementError('Add your jobs to the Profile first: the summary is written from them.');
    const facts = profileFacts(roles, skills);
    const known = [facts, text, ...input.keywords].join('\n');
    const ask = async (instruction: string) =>
      this.writer.summary({ mode: input.mode, text, facts, keywords: input.keywords, instruction });
    let kept = this.checked(await ask(input.instruction), input.keywords, text, known);
    if (!kept.options.length && kept.names.length)
      kept = this.checked(
        await ask(
          [input.instruction, `Do not mention ${kept.names.join(', ')}: the Profile does not.`]
            .filter(Boolean)
            .join(' '),
        ),
        input.keywords,
        text,
        known,
      );
    if (!kept.options.length)
      throw new AchievementError(
        "Couldn't write a summary from your Profile without adding facts. Try again.",
      );
    return { options: kept.options.slice(0, 3) };
  }

  private checked(raw: { angle: string; text: string }[], keywords: string[], text: string, known: string) {
    const options: AssistOption[] = [];
    const names = new Set<string>();
    for (const option of raw) {
      const line = option.text.replace(/[ \t]+/g, ' ').trim();
      const plain = line.replace(PLACEHOLDER, '');
      const words = line.split(/\s+/).length;
      if (line.length < 40 || words > SUMMARY_WORDS || FIRST_PERSON.test(line) || line === text) continue;
      if (!supported(plain, known)) {
        for (const name of unknownNames(plain, known)) names.add(name);
        continue;
      }
      if (LEADING.test(line) && !LEADING.test(known)) continue;
      options.push({
        angle: option.angle.trim().slice(0, 40) || 'Option',
        text: line,
        keywords: keywords.filter((keyword) => line.toLowerCase().includes(keyword.toLowerCase())),
        placeholders: [...new Set(line.match(PLACEHOLDER) ?? [])],
      });
    }
    options.sort((a, b) => b.keywords.length - a.keywords.length);
    return { options, names: [...names] };
  }
}
