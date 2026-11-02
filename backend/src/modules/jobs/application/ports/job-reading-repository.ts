import type { Job, JobExtraction } from '../../domain/job';
import type { JobChanges } from './job-repository';

/** System work has no request user. These operations are private to the worker. */
export interface JobReadingRepository {
  pendingIds(): Promise<string[]>;
  findForReading(jobId: string): Promise<Job | null>;
  readingState(jobId: string): Promise<{ extraction: JobExtraction; editedFields: string[] } | null>;
  finishReading(jobId: string, changes: JobChanges): Promise<void>;
}
