import { z } from 'zod';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import { firstJsonObject } from '../../../../../shared/ai/json';
import type { AchievementWriter } from '../../../application/ports/achievement-writer';
import {
  AchievementError,
  type AchievementDraft,
  type AchievementSource,
} from '../../../domain/achievements';

const SYSTEM = `You turn a person's own notes about one job into achievements for their career profile.
The profile keeps everything they did; later, a few of these are chosen for each CV.

ABSOLUTE RULES. Breaking any of these makes the output unusable:
- Use ONLY facts written in <notes>, <job> or <current_bullets>. Never add a number, tool,
  company, scale, team size, outcome or claim that is not written there.
- Keep every number exactly as written ("~20k" may become "~20,000", nothing else).
- Never inflate: "helped with" does not become "led", and never add an action the notes do
  not state ("used" does not become "migrated", "worked on" does not become "built";
  "secrets in AWS Secrets Manager" becomes "Stored secrets in AWS Secrets Manager", not "Moved…").

How to write each achievement:
- One fact per achievement. Split a note that holds several facts into several achievements.
- Start with a strong past-tense verb (Built, Cut, Led, Designed, Automated, Integrated).
- 8 to 30 words. No first person, no "responsible for", no buzzwords.
- Say what changed because of it when the notes say so.
- US English. No em dashes.
- Do not repeat a line from <current_bullets>; write only what is new or more specific.
- When an achievement states a result without a number and a number would make it stronger,
  set "ask" to one short question the person can answer (e.g. "About how many incidents a month?").
  Otherwise "ask" is null.

Also:
- "techStack": the technologies the notes name, as written: languages, frameworks, libraries,
  databases, cloud services, protocols and developer tools. Not companies, clients, card
  networks, payment providers or chat apps (no "Visa", "Cardinal", "Slack").
- "description": when <job> has no description, one or two sentences on what the role or
  project was (product, team, scale), from the notes only; otherwise "".

Return ONLY JSON, no prose and no code fences:
{"achievements": [{"text": "...", "ask": null}], "techStack": ["..."], "description": ""}`;

const answerSchema = z.object({
  achievements: z
    .array(z.object({ text: z.string().catch(''), ask: z.string().nullable().catch(null) }))
    .catch([]),
  techStack: z.array(z.string()).catch([]),
  description: z.string().catch(''),
});

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
    return {
      achievements: answer.achievements.map((item) => ({ text: item.text, ask: item.ask })),
      techStack: answer.techStack,
      description: answer.description,
    };
  }
}
