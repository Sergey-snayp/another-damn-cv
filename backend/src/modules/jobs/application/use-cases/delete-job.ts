import { JobNotFoundError } from '../errors';
import type { JobRepository } from '../ports/job-repository';

export class DeleteJob {
  constructor(private readonly jobs: Pick<JobRepository, 'findOwned' | 'remove'>) {}

  async execute(userId: string, id: string): Promise<void> {
    if (!(await this.jobs.findOwned(userId, id))) throw new JobNotFoundError();
    await this.jobs.remove(userId, id);
  }
}
