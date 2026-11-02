import type { JobForPreparation } from '../../contracts';
import { JobNotFoundError } from '../errors';
import type { JobRepository } from '../ports/job-repository';

export class GetJobForPreparation {
  constructor(private readonly jobs: Pick<JobRepository, 'findOwned'>) {}
  async execute(userId: string, id: string): Promise<JobForPreparation> {
    const job = await this.jobs.findOwned(userId, id);
    if (!job) throw new JobNotFoundError();
    const {
      title,
      pageTitle,
      company,
      description,
      extraction,
      salary,
      applicationResumeId,
      applicationSnapshot,
    } = job;
    return {
      id: job.id,
      title,
      pageTitle,
      company,
      description,
      extraction,
      salary,
      applicationResumeId,
      applicationSnapshot,
    };
  }
}
