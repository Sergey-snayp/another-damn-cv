import type { ResumesApi } from '../../../../resumes/contracts';
import type { ResumeLinkReader } from '../../../application/ports/resume-link-reader';

export class PublicResumeLinkReader implements ResumeLinkReader {
  constructor(private readonly resumes: Pick<ResumesApi, 'latestIdsForJobs'>) {}

  latestIdsForJobs(userId: string, jobIds: readonly string[]) {
    return this.resumes.latestIdsForJobs(userId, jobIds);
  }
}
