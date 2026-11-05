import { canonicalUrl } from '../../domain/canonical-url';
import { normalizeJobText, unprotectedFields } from '../../domain/captured-fields.policy';
import {
  APPLIED_STATUSES,
  salaryText,
  type Job,
  type JobExtraction,
  type JobFields,
  type SalaryPeriod,
} from '../../domain/job';
import { JobInputError } from '../errors';
import type { JobReadScheduler, StructuredJobReader } from '../ports/job-page-reader';
import type { JobChanges, JobRepository } from '../ports/job-repository';

export interface CaptureInput {
  url: string;
  pageTitle?: string;
  html?: string;
  text?: string;
  jsonLd?: unknown[];
  companyLogo?: string;
  /**
   * The title, company and location the extension saw on the page. Used when
   * the page's own data has none. `confirmed`: the person typed or checked
   * them, so they count as edited and a later page read keeps them.
   */
  hints?: { title?: string; company?: string; location?: string; confirmed?: boolean };
  /** The extension's job form, checked by the person: every value counts as edited. */
  details?: JobDetails;
}

export interface JobDetails {
  title: string;
  company: string;
  location: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  employmentType?: string | null;
  description?: string | null;
  notes?: string | null;
  status?: 'saved' | 'applied';
  url?: string;
}

const HINTED = ['title', 'company', 'location'] as const;

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
      // A save without a logo keeps the one found before.
      ...(input.companyLogo ? { companyLogo: input.companyLogo } : {}),
      ...(existing && read.extraction === 'pending'
        ? {}
        : unprotectedFields(read.fields, new Set(existing?.editedFields))),
    };
    const edited = new Set(existing?.editedFields);
    for (const key of HINTED) {
      const hint = input.hints?.[key]?.trim();
      if (!hint) continue;
      if (input.hints?.confirmed) {
        changes[key] = hint;
        edited.add(key);
      } else if (!edited.has(key) && !(changes[key] ?? existing?.[key])) {
        changes[key] = hint;
      }
    }
    if (input.details) this.applyDetails(input.details, changes, edited);
    if (input.hints?.confirmed || input.details) changes.editedFields = [...edited];
    let job = existing
      ? await this.jobs.update(userId, existing.id, changes)
      : await this.jobs.create({
          ...changes,
          userId,
          source: 'extension',
          canonicalUrl: canonical,
          extraction: read.extraction,
          editedFields: changes.editedFields ?? [],
        });
    // "Applied" in the form: moved like a status change in the app, with its date.
    if (input.details?.status === 'applied' && !APPLIED_STATUSES.includes(job.status)) {
      job = await this.jobs.update(
        userId,
        job.id,
        { status: 'applied' },
        { from: job.status, to: 'applied' },
      );
    }
    if (job.extraction === 'pending') this.scheduler.enqueue(job.id);
    return { job, created: !existing };
  }

  private applyDetails(details: JobDetails, changes: JobChanges, edited: Set<string>) {
    const text = (value: string | null | undefined) => value?.trim() || null;
    changes.title = details.title.trim();
    changes.company = details.company.trim();
    changes.location = details.location.trim();
    for (const key of ['title', 'company', 'location'] as const) edited.add(key);
    if (details.employmentType !== undefined) {
      changes.employmentType = text(details.employmentType);
      edited.add('employmentType');
    }
    if (details.description !== undefined && text(details.description)) {
      changes.description = text(details.description);
      edited.add('description');
    }
    if (details.notes !== undefined) changes.notes = text(details.notes);
    if (details.url) changes.url = details.url;
    const low = details.salaryMin ?? null;
    const high = details.salaryMax ?? null;
    if (low !== null || high !== null) {
      const [min, max] = low !== null && high !== null && low > high ? [high, low] : [low, high];
      Object.assign(changes, {
        salaryMin: min,
        salaryMax: max,
        salaryCurrency: text(details.salaryCurrency)?.toUpperCase() ?? null,
        salaryPeriod: details.salaryPeriod ?? null,
        salary: salaryText(
          min,
          max,
          text(details.salaryCurrency)?.toUpperCase(),
          details.salaryPeriod ?? null,
        ),
      });
      edited.add('salary');
    }
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
