import type { Job, JobStatus, JobStatusEvent, JobSummary } from '../../src/modules/jobs/domain/job';
import { JobConflictError } from '../../src/modules/jobs/application/errors';
import type {
  JobChanges,
  JobRepository,
  NewJob,
  StatusChange,
} from '../../src/modules/jobs/application/ports/job-repository';
import type { JobReadingRepository } from '../../src/modules/jobs/application/ports/job-reading-repository';

export const jobTime = new Date('2026-10-01T12:00:00.000Z');

export function exampleJob(changes: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    userId: 'owner',
    source: 'extension',
    status: 'saved',
    extraction: 'structured',
    extractionError: null,
    url: 'https://jobs.example.com/1',
    canonicalUrl: 'https://jobs.example.com/1',
    title: 'Engineer',
    company: 'Example',
    location: null,
    remote: null,
    employmentType: null,
    salary: null,
    postedAt: null,
    description: 'Build reliable systems.',
    pageTitle: 'Job page',
    html: null,
    pageText: 'Build reliable systems.',
    structuredData: null,
    editedFields: [],
    capturedAt: jobTime,
    createdAt: jobTime,
    updatedAt: jobTime,
    isFavorite: false,
    archivedAt: null,
    appliedAt: null,
    applicationResumeId: null,
    applicationSnapshot: null,
    ...changes,
  };
}

/** Fake business ports. Transaction behavior is checked separately against Postgres. */
export class MemoryJobs implements JobRepository, JobReadingRepository {
  readonly rows = new Map<string, Job>();
  readonly events = new Map<string, JobStatusEvent[]>();
  readonly updates: { userId: string; id: string; changes: JobChanges; statusChange?: StatusChange }[] = [];

  constructor(...jobs: Job[]) {
    jobs.forEach((job) => this.rows.set(job.id, structuredClone(job)));
  }

  findOwned(userId: string, id: string): Promise<Job | null> {
    const job = this.rows.get(id);
    return Promise.resolve(job?.userId === userId ? structuredClone(job) : null);
  }

  findByCanonicalUrl(userId: string, canonicalUrl: string): Promise<Job | null> {
    return Promise.resolve(
      structuredClone(
        [...this.rows.values()].find((job) => job.userId === userId && job.canonicalUrl === canonicalUrl) ??
          null,
      ),
    );
  }

  list(userId: string, status?: JobStatus): Promise<JobSummary[]> {
    const jobs = [...this.rows.values()].filter(
      (job) => job.userId === userId && (!status || job.status === status),
    );
    jobs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return Promise.resolve(
      jobs.map(
        ({
          html: _html,
          pageText: _pageText,
          structuredData: _structuredData,
          description: _description,
          ...job
        }) => structuredClone(job),
      ),
    );
  }

  history(_userId: string, jobId: string): Promise<JobStatusEvent[]> {
    const history = [...(this.events.get(jobId) ?? [])];
    history.sort((a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id));
    return Promise.resolve(structuredClone(history));
  }

  create(input: NewJob): Promise<Job> {
    const job = exampleJob({
      title: null,
      company: null,
      pageTitle: null,
      description: null,
      pageText: null,
      canonicalUrl: null,
      url: null,
      ...input,
      id: `job-${this.rows.size + 1}`,
    });
    this.rows.set(job.id, job);
    return Promise.resolve(structuredClone(job));
  }

  update(userId: string, id: string, changes: JobChanges, statusChange?: StatusChange): Promise<Job> {
    const job = this.rows.get(id);
    if (!job || job.userId !== userId) return Promise.reject(new Error('Unexpected missing job.'));
    this.updates.push({ userId, id, changes: structuredClone(changes), statusChange });
    if (statusChange) {
      const events = this.events.get(id) ?? [];
      events.push({ id: `event-${events.length + 1}`, ...statusChange, at: jobTime });
      this.events.set(id, events);
    }
    const updated = { ...job, ...changes };
    this.rows.set(id, updated);
    return Promise.resolve(structuredClone(updated));
  }

  async undoStatus(userId: string, id: string, eventId: string): Promise<Job> {
    const latest = (await this.history(userId, id))[0];
    if (latest?.id !== eventId) throw new JobConflictError();
    const job = await this.update(userId, id, { status: latest.from });
    this.events.set(
      id,
      (this.events.get(id) ?? []).filter((event) => event.id !== eventId),
    );
    return job;
  }

  remove(_userId: string, id: string): Promise<void> {
    this.rows.delete(id);
    this.events.delete(id);
    return Promise.resolve();
  }

  pendingIds(): Promise<string[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter((job) => job.extraction === 'pending')
        .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())
        .map((job) => job.id),
    );
  }

  findForReading(jobId: string): Promise<Job | null> {
    return Promise.resolve(structuredClone(this.rows.get(jobId) ?? null));
  }

  readingState(jobId: string) {
    const job = this.rows.get(jobId);
    return Promise.resolve(job ? { extraction: job.extraction, editedFields: [...job.editedFields] } : null);
  }

  async finishReading(jobId: string, changes: JobChanges): Promise<void> {
    const job = this.rows.get(jobId);
    if (!job) throw new Error('Unexpected missing job.');
    await this.update(job.userId, jobId, changes);
  }
}

export function queuedJobs() {
  const ids: string[] = [];
  return {
    ids,
    enqueue: (id: string) => {
      ids.push(id);
    },
  };
}

export const structuredPosting = (title = 'Engineer') => [
  {
    '@type': 'JobPosting',
    title,
    hiringOrganization: { name: 'Example' },
    description: '<p>Build reliable systems.</p>',
  },
];
