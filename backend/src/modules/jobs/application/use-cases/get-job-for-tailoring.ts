import type { JobForTailoring } from '../../contracts';
import { JobNotFoundError } from '../errors';
import type { JobRepository } from '../ports/job-repository';

export class GetJobForTailoring {
  constructor(private readonly jobs: Pick<JobRepository, 'findOwned'>) {}

  async execute(userId: string, id: string): Promise<JobForTailoring> {
    const job = await this.jobs.findOwned(userId, id);
    if (!job) throw new JobNotFoundError();
    const { title, pageTitle, company, description, extraction } = job;
    return { id: job.id, title, pageTitle, company, description, extraction };
  }
}
