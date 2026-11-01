import { Injectable, BadRequestException } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';

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

export interface RewriteRequest {
  /** The text as it stands. */
  text: string;
  /** What the user asked for, in their words. */
  instruction: string;
  /** Where this sits — the role it belongs to, for context only. */
  context?: string;
  /** "bullet" | "summary" | "blurb" */
  kind?: string;
}

export interface RewriteResult {
  original: string;
  suggestion: string;
  /** What the instruction asked for that the original could not support. */
  cannotDo: string[];
}

@Injectable()
export class RewriteService {
  constructor(private readonly llm: LlmService) {}

  async rewrite(request: RewriteRequest): Promise<RewriteResult> {
    const text = request.text?.trim();

    if (!text) throw new BadRequestException('There is nothing to rewrite yet.');
    if (!request.instruction?.trim()) {
      throw new BadRequestException('Say what you want changed.');
    }

    const prompt = `<original kind="${request.kind ?? 'bullet'}">
${text}
</original>
${request.context ? `\n<context>\n${request.context}\n</context>\n` : ''}
<request>
${request.instruction.trim()}
</request>

Return ONLY JSON, no prose and no code fences:

{
  "suggestion": "the rewritten line",
  "cannotDo": ["anything the request asked for that the original does not support"]
}

If the original already satisfies the request, return it unchanged and say so in
cannotDo.`;

    const raw = await this.llm.complete(prompt, SYSTEM);
    const parsed = this.parse(raw);

    return {
      original: text,
      suggestion: parsed.suggestion?.trim() || text,
      cannotDo: Array.isArray(parsed.cannotDo) ? parsed.cannotDo : [],
    };
  }

  /** Models wrap JSON in prose or fences; take the first balanced object. */
  private parse(raw: string): { suggestion?: string; cannotDo?: string[] } {
    const body = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw;
    const start = body.indexOf('{');

    if (start === -1) {
      // A model that answered in prose still answered; use it rather than fail.
      return { suggestion: raw.trim(), cannotDo: [] };
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < body.length; i++) {
      const char = body[i];

      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === '{') depth++;
      else if (char === '}' && --depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1));
        } catch {
          return { suggestion: raw.trim(), cannotDo: [] };
        }
      }
    }

    return { suggestion: raw.trim(), cannotDo: [] };
  }
}
