import type { ResumesApi } from '../../../resumes/contracts';
import type { CvJobsReader } from '../../application/use-cases/collect-from-cvs';
import type { CvJob } from '../../domain/collect';

/** Every saved CV's jobs, newest CV first, through the resumes contract. */
export class ResumeJobsReader implements CvJobsReader {
  constructor(private readonly resumes: Pick<ResumesApi, 'list' | 'current'>) {}
  async jobs(userId: string): Promise<CvJob[]> {
    const rows = (await this.resumes.list(userId))
      .filter((row) => row.currentSnapshotId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const jobs: CvJob[] = [];
    for (const row of rows) {
      const cv = await this.resumes.current(userId, row.id).catch(() => null);
      if (!cv) continue;
      for (const role of cv.experiences)
        jobs.push({
          cv: row.name,
          company: role.company,
          client: role.client ?? '',
          title: role.title,
          location: role.location ?? '',
          from: role.from,
          to: role.to ?? '',
          current: role.current === true,
          description: role.blurb ?? '',
          techStack: role.techStack ?? '',
          bullets: role.achievements.map((item) => item.bullet),
        });
    }
    return jobs;
  }
}
