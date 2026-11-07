import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type {
  CoverLetterStore,
  ListedCoverLetter,
  StoredCoverLetter,
} from '../../../application/use-cases/cover-letters';

const fields = { jobId: true, resumeId: true, text: true, fileName: true, updatedAt: true } as const;

export class PrismaCoverLetterStore implements CoverLetterStore {
  constructor(private readonly db: PrismaService) {}

  find(userId: string, jobId: string): Promise<StoredCoverLetter | null> {
    return this.db.coverLetter.findUnique({ where: { userId_jobId: { userId, jobId } }, select: fields });
  }

  async list(userId: string): Promise<ListedCoverLetter[]> {
    const rows = await this.db.coverLetter.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { ...fields, job: { select: { title: true, pageTitle: true, company: true } } },
    });
    return rows.map(({ job, ...letter }) => ({
      ...letter,
      job: { title: job.title ?? job.pageTitle, company: job.company },
    }));
  }

  async remove(userId: string, jobId: string): Promise<boolean> {
    return (await this.db.coverLetter.deleteMany({ where: { userId, jobId } })).count > 0;
  }

  save(
    userId: string,
    jobId: string,
    letter: { resumeId: string | null; text: string; fileName: string },
  ): Promise<StoredCoverLetter> {
    return this.db.coverLetter.upsert({
      where: { userId_jobId: { userId, jobId } },
      create: { userId, jobId, ...letter },
      update: letter,
      select: fields,
    });
  }
}
