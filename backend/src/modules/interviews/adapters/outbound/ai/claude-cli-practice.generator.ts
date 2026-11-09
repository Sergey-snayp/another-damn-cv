import { config } from '../../../../../shared/config/config';
import type { ClaudeProcessRunner } from '../../../../../shared/ai/claude-process.runner';
import { firstJsonObject } from '../../../../../shared/ai/json';
import type { PracticeGenerator } from '../../../application/ports/practice';
import { PracticeError, type PracticeContext, type PracticeKind } from '../../../domain/practice';
import { PRACTICE_SYSTEM, practicePrompt } from './practice-prompts';
import { practiceContentSchema } from './practice-output.schema';
import { withoutDashPunctuation } from '../../../../resumes/contracts';

export class ClaudeCliPracticeGenerator implements PracticeGenerator {
  readonly identity = { provider: 'claude-cli', model: config.interviewModel };
  constructor(private readonly runner: Pick<ClaudeProcessRunner, 'complete'>) {}
  async generate(kind: PracticeKind, context: PracticeContext) {
    let raw: string;
    try {
      raw = await this.runner.complete(practicePrompt(kind, context), PRACTICE_SYSTEM, {
        model: this.identity.model,
        timeoutMs: 240_000,
        effort: 'medium',
        maxOutputChars: 64_000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const detail = /not (logged|signed) in|authentication|login|oauth/i.test(message)
        ? 'Sign in locally with claude auth login, then try again.'
        : /too long|timeout/i.test(message)
          ? 'Claude took too long. Try again.'
          : /too large/i.test(message)
            ? 'Claude returned too much text. Try again.'
            : /limit|quota|usage|429/i.test(message)
              ? 'Claude usage is limited right now. Check your Claude account and try later.'
              : /cannot run|enoent/i.test(message)
                ? 'Claude CLI could not start. Check CLAUDE_BIN in the backend configuration.'
                : 'Claude CLI could not complete this request. Check your local Claude sign-in and model configuration.';
      throw new PracticeError('unavailable', detail);
    }
    const parsed = practiceContentSchema.safeParse(firstJsonObject(raw));
    if (
      !parsed.success ||
      (kind === 'hr' && parsed.data.questions.some((row) => row.answerKind !== 'personal')) ||
      (kind === 'technical' &&
        (parsed.data.questions.filter((row) => row.answerKind === 'personal').length < 2 ||
          parsed.data.questions.filter((row) => row.answerKind === 'conceptual').length < 2))
    ) {
      throw new PracticeError(
        'invalid-output',
        'Claude returned an incomplete question set. Your previous answers are unchanged. Try again.',
      );
    }
    return {
      questions: parsed.data.questions.map((row) => ({
        ...row,
        question: withoutDashPunctuation(row.question),
        why: withoutDashPunctuation(row.why),
        answer: withoutDashPunctuation(row.answer),
        talkingPoints: row.talkingPoints.map(withoutDashPunctuation),
        followUps: row.followUps.map(withoutDashPunctuation),
        needsInput: row.needsInput.map(withoutDashPunctuation),
      })),
    };
  }
}
