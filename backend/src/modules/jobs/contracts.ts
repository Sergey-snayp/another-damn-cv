import type { JobExtraction } from './domain/job';

export { JobNotFoundError } from './application/errors';

export interface JobForTailoring {
  id: string;
  title: string | null;
  pageTitle: string | null;
  company: string | null;
  description: string | null;
  extraction: JobExtraction;
}

/** Public operations available to other features, without HTTP or database types. */
export interface JobsApi {
  getForTailoring(userId: string, id: string): Promise<JobForTailoring>;
}
