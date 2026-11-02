import { ResumeError, type ResumesApi } from '../../../../resumes/contracts';
import type { ResumeWorkspace, TailoringJob } from '../../../application/ports/tailoring';
import { TailoringError } from '../../../application/errors';
import type { Tailoring } from '../../../domain/types';
export class PublicResumeWorkspace implements ResumeWorkspace {
  constructor(private readonly resumes: ResumesApi) {}
  async forJob(userId: string, job: TailoringJob, sourceResumeId?: string) {
    return this.call(() => this.resumes.workspaceForJob(userId, job, sourceResumeId));
  }
  async pending(userId: string, id: string): Promise<Tailoring | null> {
    return (await this.call(() => this.resumes.pending(userId, id))) as Tailoring | null;
  }
  store(userId: string, id: string, proposal: Tailoring): Promise<void> {
    return this.call(() => this.resumes.storeProposal(userId, id, proposal));
  }
  discard(userId: string, id: string): Promise<void> {
    return this.call(() => this.resumes.discardProposal(userId, id));
  }
  private async call<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ResumeError) throw new TailoringError(error.code, error.message);
      throw error;
    }
  }
}
