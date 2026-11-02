import { JobNotFoundError, type JobsApi } from '../../../../jobs/contracts';
import type { TailoringJobReader } from '../../../application/ports/tailoring';
import { TailoringError } from '../../../application/errors';
export class PublicTailoringJobReader implements TailoringJobReader {
  constructor(private readonly jobs: JobsApi) {}
  async getForTailoring(userId: string, id: string) {
    try {
      return await this.jobs.getForTailoring(userId, id);
    } catch (error) {
      if (error instanceof JobNotFoundError) throw new TailoringError('not-found', error.message);
      throw error;
    }
  }
}
