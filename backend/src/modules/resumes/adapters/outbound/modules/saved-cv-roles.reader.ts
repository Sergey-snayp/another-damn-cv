import type { ResumesApi } from '../../../contracts';
import type { SavedCvRolesReader } from '../../../application/ports/role-bullets';
import type { CvRole } from '../../../domain/role-bullets';
import { ResumeError } from '../../../application/errors';

/** Current saved CVs for this account; no discarded drafts or deleted versions. */
export class PublicSavedCvRolesReader implements SavedCvRolesReader {
  constructor(private readonly resumes: Pick<ResumesApi, 'list' | 'current'>) {}
  async roles(userId: string): Promise<CvRole[]> {
    const rows = (await this.resumes.list(userId)).filter((row) => row.currentSnapshotId);
    const queue = [...rows],
      result: CvRole[] = [];
    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        try {
          const cv = await this.resumes.current(userId, row.id);
          result.push(
            ...cv.experiences.map((role) => ({
              resumeId: row.id,
              company: role.company,
              client: role.client ?? '',
              title: role.title,
              from: role.from,
              description: role.blurb ?? '',
              techStack: role.techStack ?? '',
              bullets: role.achievements.map((item) => item.bullet),
            })),
          );
        } catch (error) {
          if (!(error instanceof ResumeError && error.code === 'not-found')) throw error;
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return result;
  }
}
