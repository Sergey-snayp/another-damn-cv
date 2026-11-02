import type { Job, JobStatus, JobStatusEvent, JobSummary } from '../../domain/job';

export type NewJob = Pick<Job, 'userId' | 'source' | 'extraction'> &
  Partial<Omit<Job, 'id' | 'userId' | 'source' | 'extraction' | 'createdAt' | 'updatedAt'>>;

export type JobChanges = Partial<
  Omit<Job, 'id' | 'userId' | 'source' | 'canonicalUrl' | 'createdAt' | 'updatedAt'>
>;

export interface StatusChange {
  from: JobStatus;
  to: JobStatus;
}

/** Every action on behalf of a user scopes its lookup by that user. */
export interface JobRepository {
  findOwned(userId: string, id: string): Promise<Job | null>;
  findByCanonicalUrl(userId: string, canonicalUrl: string): Promise<Job | null>;
  list(userId: string, status?: JobStatus): Promise<JobSummary[]>;
  history(userId: string, jobId: string): Promise<JobStatusEvent[]>;
  create(input: NewJob): Promise<Job>;
  update(userId: string, id: string, changes: JobChanges, statusChange?: StatusChange): Promise<Job>;
  undoStatus(userId: string, id: string, eventId: string): Promise<Job>;
  remove(userId: string, id: string): Promise<void>;
}
