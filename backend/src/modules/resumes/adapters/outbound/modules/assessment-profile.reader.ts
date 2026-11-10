import type { ProfileCareerApi } from '../../../../profiles/contracts';
import type { AssessmentProfileReader } from '../../../application/ports/assessment-profile';

/** The saved Profile is the only source; a selected CV is never read here. */
export class PublicAssessmentProfileReader implements AssessmentProfileReader {
  constructor(private readonly profiles: ProfileCareerApi) {}

  async read(userId: string) {
    const state = await this.profiles.read(userId);
    return {
      revision: state.revision,
      career: {
        summary: state.data.summary?.value ?? '',
        experiences: state.data.experiences?.value ?? [],
        educations: state.data.educations?.value ?? [],
        skills: state.data.skills?.value ?? [],
      },
    };
  }
}
