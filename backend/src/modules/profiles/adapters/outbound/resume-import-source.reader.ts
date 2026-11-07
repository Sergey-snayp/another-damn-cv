import { ResumeError, type ResumesApi } from '../../../resumes/contracts';
import type { CareerSourceReader } from '../../application/ports/career-profile';
import { CareerImportError, type CareerSource } from '../../domain/career-profile';
export class ResumeImportSourceReader implements CareerSourceReader {
  constructor(private readonly resumes: Pick<ResumesApi, 'atSnapshot'>) {}
  async assertOwned(userId: string, source: CareerSource) {
    if (source.kind !== 'resume') return;
    try {
      await this.resumes.atSnapshot(userId, source.id, source.snapshot);
    } catch (error) {
      if (error instanceof ResumeError && error.code === 'not-found')
        throw new CareerImportError(
          'not-found',
          'This CV version is no longer available. Choose another CV.',
        );
      throw error;
    }
  }
}
