import { unprotectedFields } from '../../domain/captured-fields.policy';
import type { JobDetail } from '../../domain/job';
import { JobInputError, JobNotFoundError } from '../errors';
import type { JobReadScheduler, StructuredJobReader } from '../ports/job-page-reader';
import type { JobRepository } from '../ports/job-repository';

export class RereadJob {
  constructor(
    private readonly jobs: Pick<JobRepository, 'findOwned' | 'update' | 'history'>,
    private readonly structured: StructuredJobReader,
    private readonly scheduler: JobReadScheduler,
  ) {}

  async execute(userId: string, id: string): Promise<JobDetail> {
    const existing = await this.jobs.findOwned(userId, id);
    if (!existing) throw new JobNotFoundError();
    const blocks: unknown[] = Array.isArray(existing.structuredData) ? existing.structuredData : [];
    const fields = blocks.length ? this.structured.read(blocks) : null;
    if (fields) {
      const job = await this.jobs.update(userId, id, {
        ...unprotectedFields(
          { ...fields, description: fields.description ?? existing.pageText ?? undefined },
          new Set(),
        ),
        editedFields: [],
        extraction: 'structured',
        extractionError: null,
      });
      return { job, history: await this.jobs.history(userId, id) };
    }
    if (!existing.pageText) {
      throw new JobInputError('There is no captured page to read again. Send it from the extension.');
    }
    const job = await this.jobs.update(userId, id, {
      editedFields: [],
      extraction: 'pending',
      extractionError: null,
    });
    this.scheduler.enqueue(id);
    return { job, history: await this.jobs.history(userId, id) };
  }
}
