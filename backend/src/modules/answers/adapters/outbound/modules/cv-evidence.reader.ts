import { ResumeError, type ResumesApi } from '../../../../resumes/contracts';
import type { CvEvidenceReader } from '../../../application/ports/answers';
import { DraftError, type CvEvidence } from '../../../domain/drafts';

/** Reads a CV through the resumes module and leaves out the contact block. */
export class PublicCvEvidenceReader implements CvEvidenceReader {
  constructor(private readonly resumes: Pick<ResumesApi, 'current'>) {}
  async read(userId: string, resumeId: string): Promise<CvEvidence> {
    const resume = await this.resumes.current(userId, resumeId).catch((error: unknown) => {
      if (error instanceof ResumeError)
        throw new DraftError('cv-not-found', 'Choose one of your CVs, then try again.');
      throw error;
    });
    return {
      summary: Object.values(resume.summaries).find((text) => text.trim()) ?? '',
      roles: resume.experiences.map((role) => ({
        company: role.client ? `${role.company} (client: ${role.client})` : role.company,
        title: role.title,
        from: role.from,
        to: role.current ? null : role.to,
        bullets: [
          role.blurb,
          ...role.achievements.map((item) => item.bullet),
          role.techStack ? `Tech stack: ${role.techStack}` : null,
        ].filter((text): text is string => Boolean(text?.trim())),
      })),
      skills: resume.skills.map((skill) => skill.name),
      education: resume.educations.map((entry) =>
        [entry.degree, entry.field, entry.institution].filter(Boolean).join(', '),
      ),
    };
  }
}
