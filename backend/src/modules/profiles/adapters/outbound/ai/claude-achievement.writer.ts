import { z } from 'zod';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import { firstJsonObject } from '../../../../../shared/ai/json';
import { BULLET_RULES, withoutAddedPurpose, withoutDashPunctuation } from '../../../../resumes/contracts';
import type { AchievementWriter, DeepenInput } from '../../../application/ports/achievement-writer';
import {
  AchievementError,
  type AchievementDraft,
  type AchievementSource,
} from '../../../domain/achievements';

const HONESTY = `ABSOLUTE RULES. Breaking any of these makes the output unusable:
- Use ONLY facts written in <notes>, <job>, <current_bullets> or <answers>. Never add a
  number, tool, product, company, scale, team size, reason, outcome or claim that is not
  written there.
- Keep every number exactly as written ("~20k" may become "~20,000", nothing else).
- Never inflate: "helped with" does not become "led", "did 2 audits" becomes "Completed 2
  audits", not "Led 2 audits", and never add an action the notes do not state ("used" does
  not become "migrated", "worked on" does not become "built").`;

const SYSTEM = `You turn a person's own notes about one job into achievements for their career profile.
The profile keeps everything they did; later, a few of these are chosen for each CV.

${HONESTY}

How to split the notes:
- One achievement per piece of work (a system, a feature, a fix, a migration, an audit, a
  team they led), at most 40 words each. Do not merge two pieces of work.
- When the notes say more about one piece of work than 40 words hold, write several
  achievements about it, each about one part: how it was built; a decision and its reason;
  how it was tested; the team they led; what it changed. Each names the work, so it stands
  on its own. Never thin one-fact lines.
- Do not repeat a line from <current_bullets>; write only what is new or fuller.

${BULLET_RULES}

Follow-up questions ("asks"): for each achievement, up to 2 short questions whose answers
would make it fuller, only about what the notes leave out:
- what it was like before ("How were certificates renewed before?"),
- why it was done this way ("Why Step Functions rather than a cron job?"),
- what part was theirs ("Did you build it alone or with a team?"),
- how many or how much ("About how many alerts a week?"),
- whether it lasted ("Is it still in use?").
An achievement that already has these gets no questions.

Also:
- "techStack": the technologies the notes name, as written: languages, frameworks, libraries,
  databases, cloud services, protocols and developer tools. Not companies, clients, card
  networks, payment providers or chat apps.
- "description": when <job> has no description, one or two sentences on what the role or
  project was (product, team, scale), from the notes only; otherwise "".

Return ONLY JSON, no prose and no code fences:
{"achievements": [{"text": "...", "asks": ["..."]}], "techStack": ["..."], "description": ""}`;

const DEEPEN_SYSTEM = `You rewrite one achievement on a person's career profile with their answers to follow-up questions.

${HONESTY}

- Rewrite only this one achievement. Keep everything it already says, and add only what the
  answers give: the before and after, the reason, their part, the counts, whether it lasted.
- Never bring in other work: only this achievement and the answers are facts here.
- An answer that says "no", "don't know" or nothing adds nothing.

${BULLET_RULES}

Return ONLY JSON, no prose and no code fences:
{"text": "...", "asks": ["any question still worth asking, at most 1"]}`;

const SPLIT_SYSTEM = `You split one achievement on a person's career profile that is too long for a CV line.

${HONESTY}

- Write 2 to 4 achievements, each at most 40 words, one or two sentences.
- Each is about one part of the work: how it was built; a decision and its reason; how it was
  tested; the team they led; what it changed or whether it lasted.
- Each names the work it is about ("the TLS certificate service"), so it reads on its own.
- Together they keep every fact of the original: every number, name and reason. Use only
  its words and facts; add nothing.

${BULLET_RULES}

Return ONLY JSON, no prose and no code fences:
{"parts": ["...", "..."]}`;

const answerSchema = z.object({
  achievements: z
    .array(
      z.object({
        text: z.string().catch(''),
        asks: z.array(z.string()).catch([]),
        ask: z.string().nullable().optional(),
      }),
    )
    .catch([]),
  techStack: z.array(z.string()).catch([]),
  description: z.string().catch(''),
});
const deepenSchema = z.object({ text: z.string().catch(''), asks: z.array(z.string()).catch([]) });
const splitSchema = z.object({ parts: z.array(z.string()).catch([]) });

export function achievementPrompt(source: AchievementSource): string {
  return `<job>
Title: ${source.title}
Company: ${source.company}${source.client ? `\nClient: ${source.client}` : ''}
Description: ${source.description || '(none)'}
Tech stack: ${source.techStack || '(none)'}
</job>

<current_bullets>
${source.bullets.map((bullet) => `- ${bullet}`).join('\n') || '(none)'}
</current_bullets>

<notes>
${source.notes}
</notes>`;
}

const factsOf = (source: AchievementSource) =>
  [
    source.title,
    source.company,
    source.client,
    source.description,
    source.techStack,
    source.notes,
    ...source.bullets,
  ].join('\n');

/** Writes with the local Claude CLI: prompt only, no tools, no saved session. */
export class ClaudeAchievementWriter implements AchievementWriter {
  constructor(private readonly llm: Pick<ClaudeProcessRunner, 'complete'>) {}

  async draft(source: AchievementSource): Promise<AchievementDraft> {
    const raw = await this.llm.complete(achievementPrompt(source), SYSTEM, {
      effort: 'medium',
      timeoutMs: 150_000,
      maxOutputChars: 60_000,
    });
    const json = firstJsonObject(raw);
    if (!json) throw new AchievementError('The AI did not return achievements. Try again.');
    const answer = answerSchema.parse(json);
    const facts = factsOf(source);
    return {
      // A benefit the notes do not state ("…to reduce risk") is cut.
      achievements: answer.achievements.map((item) => ({
        text: withoutDashPunctuation(withoutAddedPurpose(item.text, facts)),
        asks: (item.asks.length ? item.asks : item.ask ? [item.ask] : []).map(withoutDashPunctuation),
      })),
      techStack: answer.techStack,
      description: withoutDashPunctuation(answer.description),
    };
  }

  async split(input: { source: AchievementSource; text: string }): Promise<string[]> {
    const prompt = `<job>
Title: ${input.source.title}
Company: ${input.source.company}${input.source.client ? `\nClient: ${input.source.client}` : ''}
</job>

<achievement>
${input.text}
</achievement>`;
    const raw = await this.llm.complete(prompt, SPLIT_SYSTEM, {
      effort: 'medium',
      timeoutMs: 120_000,
      maxOutputChars: 20_000,
    });
    const json = firstJsonObject(raw);
    if (!json) throw new AchievementError('The AI did not split the line. Try again.');
    return splitSchema
      .parse(json)
      .parts.map((part) => withoutDashPunctuation(withoutAddedPurpose(part, input.text)));
  }

  async deepen(input: DeepenInput): Promise<{ text: string; asks: string[] }> {
    const answers = input.answers.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n');
    // Only the job, this line and the answers: other work in the notes stays out of view.
    const prompt = `<job>
Title: ${input.source.title}
Company: ${input.source.company}${input.source.client ? `\nClient: ${input.source.client}` : ''}
</job>

<achievement>
${input.text}
</achievement>

<answers>
${answers}
</answers>${input.avoid?.length ? `\n\nDo not mention ${input.avoid.join(', ')}: they belong to other work.` : ''}`;
    const raw = await this.llm.complete(prompt, DEEPEN_SYSTEM, {
      effort: 'medium',
      timeoutMs: 120_000,
      maxOutputChars: 20_000,
    });
    const json = firstJsonObject(raw);
    if (!json) throw new AchievementError('The AI did not rewrite the line. Try again.');
    const answer = deepenSchema.parse(json);
    return {
      text: withoutDashPunctuation(withoutAddedPurpose(answer.text, `${input.text}\n${answers}`)),
      asks: answer.asks.map(withoutDashPunctuation),
    };
  }
}
