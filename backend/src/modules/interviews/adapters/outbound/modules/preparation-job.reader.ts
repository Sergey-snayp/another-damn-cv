import { JobNotFoundError, type JobsApi } from '../../../../jobs/contracts';
import { PreparationNotFoundError } from '../../../domain/preparation';
import type { PreparationJobReader } from '../../../application/ports/preparation';
export class PublicPreparationJobReader implements PreparationJobReader {
  constructor(private readonly jobs: Pick<JobsApi, 'getForTailoring'>) {}
  async assertOwned(userId: string, jobId: string) {
    try {
      await this.jobs.getForTailoring(userId, jobId);
    } catch (error) {
      if (error instanceof JobNotFoundError) throw new PreparationNotFoundError();
      throw error;
    }
  }
}
