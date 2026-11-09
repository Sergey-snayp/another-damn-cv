import { z } from 'zod';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import { firstJsonObject } from '../../../../../shared/ai/json';
import type { BulletChooser } from '../../../application/ports/role-bullets';
import { BULLET_RULES, WRITING_RULES } from '../../../domain/cv-writing-guide';
import { ResumeError } from '../../../application/errors';

const SYSTEM = `You choose the bullets for one job on a CV, for one job posting.
The candidate keeps many achievements for this job; a CV shows only a few. Pick the ones
that best show what the posting asks for.

ABSOLUTE RULES. Breaking any of these makes the output unusable:
- Choose only from <achievements>, by id. Each id at most once.
- You may reword a chosen achievement to use the posting's words where the fact already
  matches (see its "posting words" hint), and to tighten it. Never add a tool, number,
  scale, outcome, team size or claim that the achievement itself does not have. Keep every
  number exactly.
- Never inflate: "helped with" does not become "led".
- Never tack the posting's words onto a line ("…for reliability", "…following security best
  practices", "…supporting on-call"). Use a posting word only in place of the line's own
  word for the same thing. If no wording fits, keep the achievement as written.
- Never claim a practice the achievement does not show (on-call, ownership, leadership, scale).

How to choose:
- Exactly the requested count in "chosen", best first.
- Prefer achievements that match the posting's requirements and responsibilities, then
  concrete results with numbers, then starred ones (the candidate's strongest).
- Cover different requirements rather than repeating one.
- Then up to 4 next-best in "alternates", reworded the same way.

Return ONLY JSON, no prose and no code fences:
{"chosen": [{"id": "p3", "text": "..."}], "alternates": [{"id": "c1", "text": "..."}]}

${WRITING_RULES}

${BULLET_RULES}`;

const pick = z.array(z.object({ id: z.string().catch(''), text: z.string().catch('') })).catch([]);
const answerSchema = z.object({ chosen: pick, alternates: pick });

/** Chooses with the local Claude CLI: prompt only, no tools, no saved session. */
export class ClaudeBulletChooser implements BulletChooser {
  constructor(private readonly llm: Pick<ClaudeProcessRunner, 'complete'>) {}
  async choose(input: Parameters<BulletChooser['choose']>[0]) {
    const items = input.items
      .map(
        (item) =>
          `<achievement id="${item.id}"${item.starred ? ' starred="yes"' : ''}>${item.text}${
            item.hint ? `\nposting words: ${item.hint}` : ''
          }</achievement>`,
      )
      .join('\n');
    const prompt = `<posting>\n${input.job}\n</posting>\n\n<achievements>\n${items}\n</achievements>\n\nChoose ${input.count}.${
      input.instruction ? `\n\n<request>\n${input.instruction}\n</request>` : ''
    }`;
    const raw = await this.llm.complete(prompt, SYSTEM, {
      effort: 'medium',
      timeoutMs: 150_000,
      maxOutputChars: 40_000,
    });
    const json = firstJsonObject(raw);
    if (!json) throw new ResumeError('invalid', 'The AI did not choose bullets. Try again.');
    return answerSchema.parse(json);
  }
}
