import type { ResumesApi } from '../../../resumes/contracts';
import type { ResumeSectionsReader } from '../../application/ports/career-profile';
import type { CareerSections } from '../../domain/career-profile';

/** A CV's current version as career sections, the same way Profile → Import reads it. */
export class ResumeSectionsAdapter implements ResumeSectionsReader {
  constructor(private readonly resumes: Pick<ResumesApi, 'current'>) {}
  async read(userId: string, resumeId: string): Promise<CareerSections> {
    const cv = await this.resumes.current(userId, resumeId);
    return {
      summary: cv.summaries.default || Object.values(cv.summaries).find(Boolean) || '',
      experiences: cv.experiences.map((role) => ({
        company: role.company,
        title: role.title,
        client: role.client || '',
        location: role.location || '',
        from: role.from,
        to: role.to || '',
        current: role.current === true,
        description: role.blurb || '',
        bullets: role.achievements.map((item) => item.bullet),
      })),
      educations: cv.educations.map((entry) => ({
        institution: entry.institution,
        degree: entry.degree,
        field: entry.field || '',
        from: entry.from,
        to: entry.to || '',
      })),
      skills: cv.skills.map((skill) => skill.name),
    };
  }
}
