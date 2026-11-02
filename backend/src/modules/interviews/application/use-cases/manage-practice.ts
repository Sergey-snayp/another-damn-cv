import {
  PRACTICE_PROMPT_VERSION,
  PracticeError,
  assertPracticeEvidence,
  practiceProblems,
  type PracticeContext,
  type PracticeKind,
  type PracticeRecord,
  type PracticeView,
} from '../../domain/practice';
import type {
  PracticeContextReader,
  PracticeRepository,
  PracticeGenerator,
  PracticeFingerprint,
} from '../ports/practice';

export class GeneratePractice {
  private readonly pending = new Map<string, { hash: string; promise: Promise<PracticeView> }>();
  constructor(
    private readonly context: PracticeContextReader,
    private readonly repository: PracticeRepository,
    private readonly generator: PracticeGenerator,
    private readonly fingerprint: PracticeFingerprint,
    private readonly now = () => new Date(),
  ) {}

  hash(kind: PracticeKind, context: PracticeContext) {
    return this.fingerprint.hash(
      JSON.stringify({ kind, context, prompt: PRACTICE_PROMPT_VERSION, ...this.generator.identity }),
    );
  }
  running(userId: string, jobId: string): PracticeKind[] {
    return (['hr', 'technical'] as const).filter((kind) => this.pending.has(this.key(userId, jobId, kind)));
  }
  private key(userId: string, jobId: string, kind: PracticeKind) {
    return JSON.stringify([userId, jobId, kind]);
  }

  async execute(
    userId: string,
    jobId: string,
    kind: PracticeKind,
    regenerate = false,
  ): Promise<PracticeView> {
    const context = await this.context.read(userId, jobId);
    const problems = practiceProblems(context);
    if (problems.length) throw new PracticeError('invalid', problems.join(' '));
    const inputHash = this.hash(kind, context);
    const key = this.key(userId, jobId, kind);
    const existingRun = this.pending.get(key);
    if (existingRun) {
      if (existingRun.hash !== inputHash)
        throw new PracticeError(
          'busy',
          'This question set is already generating with earlier inputs. Wait for it to finish.',
        );
      return existingRun.promise;
    }
    const promise = this.generate(userId, jobId, kind, context, inputHash, regenerate);
    this.pending.set(key, { hash: inputHash, promise });
    try {
      return await promise;
    } finally {
      if (this.pending.get(key)?.promise === promise) this.pending.delete(key);
    }
  }

  private async generate(
    userId: string,
    jobId: string,
    kind: PracticeKind,
    context: PracticeContext,
    inputHash: string,
    regenerate: boolean,
  ): Promise<PracticeView> {
    const existing = (await this.repository.list(userId, jobId)).find((row) => row.kind === kind);
    if (existing?.inputHash === inputHash && !regenerate) return { ...existing, stale: false };
    const content = await this.generator.generate(kind, context);
    assertPracticeEvidence(content, context);
    const latest = await this.context.read(userId, jobId); // Recheck ownership after the slow provider call.
    const record: PracticeRecord = {
      ...content,
      ...this.generator.identity,
      jobId,
      kind,
      inputHash,
      promptVersion: PRACTICE_PROMPT_VERSION,
      generatedAt: this.now(),
      cv: context.cv!,
      evidence: context.evidence,
    };
    const saved = await this.repository.save(userId, record);
    return { ...saved, stale: this.hash(kind, latest) !== inputHash };
  }
}

export class GetPractice {
  constructor(
    private readonly context: PracticeContextReader,
    private readonly repository: PracticeRepository,
    private readonly generation: GeneratePractice,
  ) {}
  async execute(userId: string, jobId: string) {
    const context = await this.context.read(userId, jobId);
    const rows = await this.repository.list(userId, jobId);
    return {
      results: rows.map((row) => ({
        ...row,
        stale: row.inputHash !== this.generation.hash(row.kind, context),
      })),
      problems: practiceProblems(context),
      running: this.generation.running(userId, jobId),
    };
  }
}
