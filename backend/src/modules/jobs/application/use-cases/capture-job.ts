import { canonicalUrl } from '../../domain/canonical-url';
import { normalizeJobText, unprotectedFields } from '../../domain/captured-fields.policy';
import type { Job, JobExtraction, JobFields } from '../../domain/job';
import { JobInputError } from '../errors';
import type { JobReadScheduler, StructuredJobReader } from '../ports/job-page-reader';
import type { JobChanges, JobRepository } from '../ports/job-repository';

export interface CaptureInput {
  url: string;
  pageTitle?: string;
  html?: string;
  text?: string;
  jsonLd?: unknown[];
}

export class CaptureJob {
  constructor(
    private readonly jobs: Pick<JobRepository, 'findByCanonicalUrl' | 'create' | 'update'>,
    private readonly structured: StructuredJobReader,
    private readonly scheduler: JobReadScheduler,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string, input: CaptureInput): Promise<{ job: Job; created: boolean }> {
    const canonical = canonicalUrl(input.url);
    if (!canonical) throw new JobInputError('That page has no web address a job can be saved under.');

    const pageText = input.text ? normalizeJobText(input.text) : '';
    const existing = await this.jobs.findByCanonicalUrl(userId, canonical);
    const read = this.firstRead(input.jsonLd, pageText);
    const changes: JobChanges = {
      url: input.url,
      pageTitle: input.pageTitle ?? null,
      html: input.html ?? null,
      pageText: pageText || null,
      structuredData: input.jsonLd?.length ? input.jsonLd : null,
      extraction: read.extraction,
      extractionError: read.extraction === 'failed' ? 'Nothing readable was captured from that page.' : null,
      capturedAt: this.now(),
      ...(existing && read.extraction === 'pending'
        ? {}
        : unprotectedFields(read.fields, new Set(existing?.editedFields))),
    };
    const job = existing
      ? await this.jobs.update(userId, existing.id, changes)
      : await this.jobs.create({
          ...changes,
          userId,
          source: 'extension',
          canonicalUrl: canonical,
          extraction: read.extraction,
          editedFields: [],
        });
    if (job.extraction === 'pending') this.scheduler.enqueue(job.id);
    return { job, created: !existing };
  }

  private firstRead(
    blocks: unknown[] | undefined,
    pageText: string,
  ): { extraction: JobExtraction; fields: JobFields } {
    const fields = blocks?.length ? this.structured.read(blocks) : null;
    if (fields)
      return {
        extraction: 'structured',
        fields: { ...fields, description: fields.description ?? (pageText || undefined) },
      };
    if (pageText) return { extraction: 'pending', fields: { description: pageText } };
    return { extraction: 'failed', fields: {} };
  }
}
