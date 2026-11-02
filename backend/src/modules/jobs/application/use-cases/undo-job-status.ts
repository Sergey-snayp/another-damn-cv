import type { JobDetail } from '../../domain/job';
import { JobNotFoundError } from '../errors';
import type { JobRepository } from '../ports/job-repository';

export class UndoJobStatus {
  constructor(private readonly jobs: Pick<JobRepository, 'findOwned' | 'undoStatus' | 'history'>) {}

  async execute(userId: string, id: string, eventId: string): Promise<JobDetail> {
    if (!(await this.jobs.findOwned(userId, id))) throw new JobNotFoundError();
    const job = await this.jobs.undoStatus(userId, id, eventId);
    return { job, history: await this.jobs.history(userId, id) };
  }
}
