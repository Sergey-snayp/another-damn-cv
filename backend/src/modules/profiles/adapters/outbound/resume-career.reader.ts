import type { ResumesApi } from '../../../resumes/contracts';
import type { ProfileCareerReader } from '../../application/ports/profile-career-reader';

export class ResumeCareerReader implements ProfileCareerReader {
  constructor(private readonly resumes: Pick<ResumesApi, 'career'>) {}
  read(userId: string) {
    return this.resumes.career(userId);
  }
}
