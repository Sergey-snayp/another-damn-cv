import { z } from 'zod';
import { config } from '../../../../../shared/config/config';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import { firstJsonObject } from '../../../../../shared/ai/json';
import type { AnswerDrafter } from '../../../application/ports/answers';
import { DraftError, type DraftContext } from '../../../domain/drafts';
import { DRAFT_SYSTEM, draftPrompt } from './draft-prompt';
import { withoutDashPunctuation } from '../../../../resumes/contracts';

const draftSchema = z
  .object({ answer: z.string().max(20000), needsInput: z.array(z.string().max(400)).max(5) })
  .strict();

/** Drafts with the local Claude CLI: prompt only, no tools, no saved session. */
export class ClaudeCliAnswerDrafter implements AnswerDrafter {
  constructor(private readonly runner: Pick<ClaudeProcessRunner, 'complete'>) {}
  async draft(context: DraftContext) {
    let raw: string;
    try {
      raw = await this.runner.complete(draftPrompt(context), DRAFT_SYSTEM, {
        model: config.interviewModel,
        timeoutMs: 120_000,
        effort: 'medium',
        maxOutputChars: 40_000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      throw new DraftError(
        'unavailable',
        /not (logged|signed) in|authentication|login|oauth/i.test(message)
          ? 'Sign in locally with claude auth login, then try again.'
          : /too long|timeout/i.test(message)
            ? 'Claude took too long. Try again.'
            : /limit|quota|usage|429/i.test(message)
              ? 'Claude usage is limited right now. Try later.'
              : /cannot run|enoent/i.test(message)
                ? 'Claude CLI could not start. Check CLAUDE_BIN in the backend configuration.'
                : 'Claude could not draft this answer. Try again.',
      );
    }
    const parsed = draftSchema.safeParse(firstJsonObject(raw));
    if (!parsed.success)
      throw new DraftError('invalid-output', 'Claude returned an unusable draft. Try again.');
    return {
      answer:
        context.kind === 'text' || context.kind === 'textarea'
          ? withoutDashPunctuation(parsed.data.answer)
          : parsed.data.answer,
      needsInput: parsed.data.needsInput.map(withoutDashPunctuation),
    };
  }
}
