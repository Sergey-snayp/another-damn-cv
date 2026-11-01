/** What the web app and the extension see of a job. The captured page itself stays on the server. */
import type { Job, JobStatusEvent } from '@prisma/client';
import type { StatusName } from './jobs.schemas';

export interface JobDto {
  id: string;
  source: 'extension' | 'scanner' | 'manual';
  status: StatusName;
  extraction: 'pending' | 'structured' | 'llm' | 'manual' | 'failed';
  extractionError: string | null;
  url: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  remote: boolean | null;
  employmentType: string | null;
  salary: string | null;
  postedAt: string | null;
  description: string | null;
  pageTitle: string | null;
  editedFields: string[];
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type JobSummaryDto = Omit<JobDto, 'description'> & {
  /** The copy made by "Tailor resume for this job", if there is one. */
  tailoredResumeId: string | null;
};

export interface StatusEventDto {
  id: string;
  from: StatusName;
  to: StatusName;
  at: string;
}

/** A single job with its moves, newest first: the first is the one Undo reverts. */
export type JobDetailDto = JobDto & { history: StatusEventDto[] };

/** Never sent to the browser: large, and only the server re-reads them. */
export const CAPTURED_PAGE_COLUMNS = { html: true, pageText: true, structuredData: true } as const;

type JobRow = Omit<Job, keyof typeof CAPTURED_PAGE_COLUMNS>;

export function toJobDto(job: JobRow): JobDto {
  return {
    id: job.id,
    source: lower(job.source),
    status: lower(job.status),
    extraction: lower(job.extraction),
    extractionError: job.extractionError,
    url: job.url,
    title: job.title,
    company: job.company,
    location: job.location,
    remote: job.remote,
    employmentType: job.employmentType,
    salary: job.salary,
    postedAt: job.postedAt?.toISOString() ?? null,
    description: job.description,
    pageTitle: job.pageTitle,
    editedFields: job.editedFields,
    capturedAt: job.capturedAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function toJobSummaryDto(
  job: Omit<JobRow, 'description'>,
  tailoredResumeId: string | null,
): JobSummaryDto {
  const { description: _description, ...summary } = toJobDto({ ...job, description: null });
  return { ...summary, tailoredResumeId };
}

export function toStatusEventDto(event: JobStatusEvent): StatusEventDto {
  return { id: event.id, from: lower(event.from), to: lower(event.to), at: event.at.toISOString() };
}

/** Enum values go out lowercase: that is how the API spells them. */
function lower<T extends string>(value: T): Lowercase<T> {
  return value.toLowerCase() as Lowercase<T>;
}
