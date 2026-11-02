export const JOB_STATUSES = [
  'saved',
  'dismissed',
  'applied',
  'screening',
  'interview',
  'offer',
  'accepted',
  'rejected',
  'declined',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobSource = 'extension' | 'scanner' | 'manual';
export type JobExtraction = 'pending' | 'structured' | 'llm' | 'manual' | 'failed';

/** Stored business data. Captured pages are private, and never presented directly. */
export interface Job {
  id: string;
  userId: string;
  source: JobSource;
  status: JobStatus;
  extraction: JobExtraction;
  extractionError: string | null;
  url: string | null;
  canonicalUrl: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  remote: boolean | null;
  employmentType: string | null;
  salary: string | null;
  postedAt: Date | null;
  description: string | null;
  pageTitle: string | null;
  html: string | null;
  pageText: string | null;
  structuredData: unknown;
  editedFields: string[];
  capturedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobStatusEvent {
  id: string;
  from: JobStatus;
  to: JobStatus;
  at: Date;
}

export interface JobDetail {
  job: Job;
  history: JobStatusEvent[];
}

export type JobSummary = Omit<Job, 'html' | 'pageText' | 'structuredData' | 'description'>;

/** Fields learned from a page. A missing value clears an unprotected field. */
export interface JobFields {
  title?: string;
  company?: string;
  location?: string;
  remote?: boolean;
  employmentType?: string;
  salary?: string;
  postedAt?: string;
  description?: string;
}

export const EDITABLE_FIELDS = [
  'title',
  'company',
  'location',
  'remote',
  'employmentType',
  'salary',
  'description',
] as const satisfies readonly (keyof JobFields)[];

export type EditableField = (typeof EDITABLE_FIELDS)[number];
