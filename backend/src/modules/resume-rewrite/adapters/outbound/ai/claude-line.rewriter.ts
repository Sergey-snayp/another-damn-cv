import { z } from 'zod';
import { firstJsonObject } from '../../../../../shared/ai/json';
import type {
  LineRewriter,
  RewriteInput,
  RewriteResult,
} from '../../../application/use-cases/rewrite-resume-line';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';

/**
 * Rewriting one piece of a resume.
 *
 * The model may reword; it may not add. Everything it writes goes onto a real
 * job application, so a metric or technology it invents is a lie the candidate
 * ends up defending in an interview.
 *
 * Nothing is applied automatically: the suggestion goes back with the original
 * so a person can compare and decide.
 */
const SYSTEM = `You rewrite one line of someone's CV.

ABSOLUTE RULES — breaking any of these makes the output unusable:
- Use ONLY facts present in the original text. Never add a technology, metric,
  company, date, scale or outcome that is not already there.
- If the user asks for something the original cannot support — "add numbers",
  "make it sound more senior" — rewrite what you can and say plainly in
  "cannotDo" what you could not, and why.
- Never inflate. "Helped build" does not become "led".
- Keep it to one or two lines. Dense and concrete beats long.
- Keep the candidate's voice. This is their claim, not your prose.

What you SHOULD do: cut filler, lead with the outcome, use the vocabulary the
user asked for when the underlying fact already matches, and prefer active verbs.`;

export class ClaudeLineRewriter implements LineRewriter {
  constructor(private readonly llm: Pick<ClaudeProcessRunner, 'complete'>) {}

  async rewrite(request: RewriteInput): Promise<RewriteResult> {
    const { text, instruction } = request;

    const prompt = `<original kind="${request.kind ?? 'bullet'}">
${text}
</original>
${request.context ? `\n<context>\n${request.context}\n</context>\n` : ''}
<request>
${instruction}
</request>

Return ONLY JSON, no prose and no code fences:

{
  "suggestion": "the rewritten line",
  "cannotDo": ["anything the request asked for that the original does not support"]
}

If the original already satisfies the request, return it unchanged and say so in
cannotDo.`;

    const answer = readAnswer(await this.llm.complete(prompt, SYSTEM));
    return { original: text, suggestion: answer.suggestion.trim() || text, cannotDo: answer.cannotDo };
  }
}

/** The model's answer. Prose without JSON still answered: it becomes the suggestion. */
function readAnswer(raw: string): { suggestion: string; cannotDo: string[] } {
  const json = firstJsonObject(raw);
  if (!json) return { suggestion: raw.trim(), cannotDo: [] };
  return answerSchema.parse(json);
}

const answerSchema = z.object({
  suggestion: z.string().catch(''),
  cannotDo: z.array(z.string()).catch([]),
});
