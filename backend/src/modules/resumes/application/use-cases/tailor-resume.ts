import type { ResumeWorkspace, TailoringGenerator, TailoringJobReader } from '../ports/tailoring';
import { TailoringError } from '../tailoring-error';
import { planTailoring } from '../../domain/tailoring/policy';
import { applyRetry, blockedLines } from '../../domain/tailoring/retry';
import type { Tailoring } from '../../domain/tailoring/types';

export class TailorResume {
  constructor(
    private readonly jobs: TailoringJobReader,
    private readonly resumes: ResumeWorkspace,
    private readonly generator: TailoringGenerator,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async execute(input: {
    userId: string;
    jobId: string;
    sourceResumeId?: string;
  }): Promise<{ resumeId: string; tailoring: Tailoring }> {
    const job = await this.jobs.getForTailoring(input.userId, input.jobId);
    if (job.extraction === 'pending')
      throw new TailoringError('pending', 'The job page is still being read. Try again in a moment.');
    if (!job.description?.trim())
      throw new TailoringError('invalid', 'This job has no description to tailor to. Add one first.');
    const workspace = await this.resumes.forJob(input.userId, job, input.sourceResumeId);
    const resume = workspace.document;
    if (!resume.experiences.length && !Object.keys(resume.summaries).length)
      throw new TailoringError('invalid', 'That resume is empty. Fill it in, then tailor it.');
    const forPrompt = { id: job.id, title: job.title, company: job.company, description: job.description };
    const candidate = await this.generator.generate(resume, forPrompt);
    if (!candidate) throw new TailoringError('unavailable', 'The AI answer could not be read. Try again.');
    let tailoring: Tailoring = {
      ...planTailoring(candidate, resume, forPrompt),
      jobId: job.id,
      jobTitle: job.title ?? job.pageTitle ?? 'this job',
      company: job.company,
      createdAt: this.now().toISOString(),
    };
    const blocked = blockedLines(tailoring);
    if (blocked.length) {
      try {
        tailoring = applyRetry(await this.generator.retry(blocked), tailoring, resume, forPrompt);
      } catch {
        /* Keep the first answer and its original-text fallback. */
      }
    }
    await this.resumes.store(input.userId, workspace.id, tailoring);
    return { resumeId: workspace.id, tailoring };
  }
}
export class GetPendingTailoring {
  constructor(private readonly resumes: ResumeWorkspace) {}
  async execute(input: { userId: string; id: string }) {
    return { tailoring: await this.resumes.pending(input.userId, input.id) };
  }
}
export class DiscardTailoring {
  constructor(private readonly resumes: ResumeWorkspace) {}
  execute(input: { userId: string; id: string }): Promise<void> {
    return this.resumes.discard(input.userId, input.id);
  }
}
