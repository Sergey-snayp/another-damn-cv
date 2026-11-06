import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type { CoverLetterStore, StoredCoverLetter } from '../../../application/use-cases/cover-letters';

const fields = { jobId: true, resumeId: true, text: true, fileName: true, updatedAt: true } as const;

export class PrismaCoverLetterStore implements CoverLetterStore {
  constructor(private readonly db: PrismaService) {}

  find(userId: string, jobId: string): Promise<StoredCoverLetter | null> {
    return this.db.coverLetter.findUnique({ where: { userId_jobId: { userId, jobId } }, select: fields });
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
