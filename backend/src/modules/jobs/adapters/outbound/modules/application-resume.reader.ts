import { ResumeError, type ResumesApi } from '../../../../resumes/contracts';
import type { ApplicationResumeReader } from '../../../application/ports/application-repository';

export class PublicApplicationResumeReader implements ApplicationResumeReader {
  constructor(private readonly resumes: Pick<ResumesApi, 'current' | 'snapshots'>) {}
  async savedSnapshot(userId: string, resumeId: string, number?: number): Promise<number | null> {
    try {
      if (number !== undefined)
        return (await this.resumes.snapshots(userId, resumeId)).some((snapshot) => snapshot.number === number)
          ? number
          : null;
      return (await this.resumes.current(userId, resumeId)).snapshot || null;
    } catch (error) {
      if (error instanceof ResumeError && error.code === 'not-found') return null;
      throw error;
    }
  }
}
