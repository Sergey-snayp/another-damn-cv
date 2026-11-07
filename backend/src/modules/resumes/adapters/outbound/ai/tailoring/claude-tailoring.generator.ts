import type { ClaudeProcessRunner } from '../../../../../../shared/ai/claude-process.runner';
import type { TailoringGenerator } from '../../../../application/ports/tailoring';
import type { RenderedResume } from '../../../../domain/tailoring/resume';
import type { JobForTailoring } from '../../../../domain/tailoring/types';
import type { BlockedLine } from '../../../../domain/tailoring/retry';
import { TailoringError } from '../../../../application/tailoring-error';
import { TAILOR_SYSTEM, tailorPrompt } from './prompt';
import { retryPrompt } from './retry-prompt';
import { readCandidate, readRetry } from './answer';
export class ClaudeTailoringGenerator implements TailoringGenerator {
  constructor(private readonly runner: Pick<ClaudeProcessRunner, 'complete'>) {}
  async generate(resume: RenderedResume, job: JobForTailoring) {
    const { prompt, ids } = tailorPrompt(resume, job);
    return readCandidate(await this.complete(prompt, 300_000), ids);
  }
  async retry(lines: BlockedLine[]) {
    return readRetry(await this.complete(retryPrompt(lines), 120_000));
  }
  private async complete(prompt: string, timeoutMs: number) {
    try {
      return await this.runner.complete(prompt, TAILOR_SYSTEM, { timeoutMs, effort: 'medium' });
    } catch (error) {
      throw new TailoringError(
        'unavailable',
        error instanceof Error ? error.message : 'The model could not be reached.',
      );
    }
  }
}
