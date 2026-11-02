import { unprotectedFields } from '../../domain/captured-fields.policy';
import type { JobPageExtractor } from '../ports/job-page-reader';
import type { JobReadingRepository } from '../ports/job-reading-repository';

export class ReadJobPage {
  constructor(
    private readonly jobs: JobReadingRepository,
    private readonly extractor: JobPageExtractor,
  ) {}

  async execute(jobId: string): Promise<void> {
    const job = await this.jobs.findForReading(jobId);
    if (job?.extraction !== 'pending' || !job.pageText) return;
    const outcome = await this.extractor.extract({
      url: job.url ?? '',
      pageTitle: job.pageTitle,
      text: job.pageText,
    });
    const current = await this.jobs.readingState(jobId);
    if (current?.extraction !== 'pending') return;
    await this.jobs.finishReading(
      jobId,
      'fields' in outcome
        ? {
            ...unprotectedFields(outcome.fields, new Set(current.editedFields)),
            extraction: 'llm',
            extractionError: null,
          }
        : { extraction: 'failed', extractionError: outcome.failure },
    );
  }
}
