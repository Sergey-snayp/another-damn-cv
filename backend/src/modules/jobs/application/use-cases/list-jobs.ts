import type { JobStatus, JobSummary } from '../../domain/job';
import type { JobRepository } from '../ports/job-repository';
import type { ResumeLinkReader } from '../ports/resume-link-reader';

export class ListJobs {
  constructor(
    private readonly jobs: Pick<JobRepository, 'list'>,
    private readonly resumes: ResumeLinkReader,
  ) {}

  async execute(
    userId: string,
    status?: JobStatus,
  ): Promise<{ job: JobSummary; tailoredResumeId: string | null }[]> {
    const jobs = await this.jobs.list(userId, status);
    const ids = await this.resumes.latestIdsForJobs(
      userId,
      jobs.map((job) => job.id),
    );
    return jobs.map((job) => ({ job, tailoredResumeId: ids[job.id] ?? null }));
  }
}
