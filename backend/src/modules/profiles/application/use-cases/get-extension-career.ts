import { autofillCareerFields, fullSections, type CareerSections } from '../../domain/career-profile';
import type { CareerProfileRepository, ResumeSectionsReader } from '../ports/career-profile';

/**
 * The extension's Profile tab and the fields Autofill takes from it: from the
 * Profile, or from one CV ("Autofill uses: Selected resume").
 */
export class GetExtensionCareer {
  constructor(
    private readonly profile: CareerProfileRepository,
    private readonly resumes: ResumeSectionsReader,
    private readonly year = () => new Date().getFullYear(),
  ) {}
  async fromProfile(userId: string) {
    return this.view(fullSections((await this.profile.read(userId)).data));
  }
  async fromResume(userId: string, resumeId: string) {
    return this.view(await this.resumes.read(userId, resumeId));
  }
  private view(sections: CareerSections) {
    return { ...sections, fields: autofillCareerFields(sections, this.year()) };
  }
}
