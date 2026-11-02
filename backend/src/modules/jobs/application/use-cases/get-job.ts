import type { JobDetail } from '../../domain/job';
import { JobNotFoundError } from '../errors';
import type { JobRepository } from '../ports/job-repository';

export class GetJob {
  constructor(private readonly jobs: Pick<JobRepository, 'findOwned' | 'history'>) {}

  async execute(userId: string, id: string): Promise<JobDetail> {
    const job = await this.jobs.findOwned(userId, id);
    if (!job) throw new JobNotFoundError();
    return { job, history: await this.jobs.history(userId, id) };
  }
}
