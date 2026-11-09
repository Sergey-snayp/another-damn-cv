import { collectFromCvs, type CollectedJob, type CvJob } from '../../domain/collect';
import type { CareerProfileRepository } from '../ports/career-profile';

/** All the person's saved CVs, as jobs. */
export interface CvJobsReader {
  jobs(userId: string): Promise<CvJob[]>;
}

/**
 * What all saved CVs add to the Profile, for the person to review. Nothing is
 * saved here: the Profile page saves what they keep, on the revision returned.
 */
export class CollectFromCvs {
  constructor(
    private readonly career: Pick<CareerProfileRepository, 'read'>,
    private readonly cvs: CvJobsReader,
  ) {}
  async execute(userId: string): Promise<{ revision: number; jobs: CollectedJob[] }> {
    const state = await this.career.read(userId);
    const roles = state.data.experiences?.value ?? [];
    return { revision: state.revision, jobs: collectFromCvs(roles, await this.cvs.jobs(userId)) };
  }
}
