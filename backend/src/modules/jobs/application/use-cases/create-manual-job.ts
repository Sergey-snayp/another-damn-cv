import { canonicalUrl } from '../../domain/canonical-url';
import { normalizeJobText } from '../../domain/captured-fields.policy';
import type { Job } from '../../domain/job';
import { JobInputError } from '../errors';
import type { JobReadScheduler } from '../ports/job-page-reader';
import type { JobRepository } from '../ports/job-repository';

export interface ManualJobInput {
  description: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  url?: string | null;
}

export class CreateManualJob {
  constructor(
    private readonly jobs: Pick<JobRepository, 'findByCanonicalUrl' | 'create'>,
    private readonly scheduler: JobReadScheduler,
  ) {}

  async execute(userId: string, input: ManualJobInput): Promise<Job> {
    const description = normalizeJobText(input.description);
    const canonical = input.url ? canonicalUrl(input.url) : null;
    if (input.url && !canonical) throw new JobInputError('That link is not a valid web address.');
    if (canonical && (await this.jobs.findByCanonicalUrl(userId, canonical))) {
      throw new JobInputError('That job is already saved.');
    }
    const title = input.title ?? null;
    const company = input.company ?? null;
    const needsReading = !title || !company;
    const job = await this.jobs.create({
      userId,
      source: 'manual',
      url: input.url ?? null,
      canonicalUrl: canonical,
      title,
      company,
      location: input.location ?? null,
      description,
      pageText: description,
      editedFields: [title && 'title', company && 'company'].filter((field): field is string => !!field),
      extraction: needsReading ? 'pending' : 'manual',
    });
    if (needsReading) this.scheduler.enqueue(job.id);
    return job;
  }
}
