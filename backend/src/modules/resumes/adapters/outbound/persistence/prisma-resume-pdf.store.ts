import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type { ResumePdfStore, StoredPdf } from '../../../application/ports/resume-pdf';

export class PrismaResumePdfStore implements ResumePdfStore {
  constructor(private readonly db: PrismaService) {}

  async theme(resumeId: string): Promise<unknown> {
    return (
      (await this.db.resume.findUnique({ where: { id: resumeId }, select: { theme: true } }))?.theme ?? null
    );
  }

  async setTheme(resumeId: string, theme: unknown): Promise<void> {
    await this.db.resume.update({
      where: { id: resumeId },
      data: { theme: theme === null ? Prisma.DbNull : (theme as Prisma.InputJsonValue) },
    });
  }

  async rename(resumeId: string, name: string): Promise<void> {
    await this.db.resume.update({ where: { id: resumeId }, data: { name } });
  }

  async find(resumeId: string): Promise<StoredPdf | null> {
    const row = await this.db.resumePdf.findUnique({ where: { resumeId } });
    return row ? { version: row.version, fileName: row.fileName, pdf: Buffer.from(row.pdf) } : null;
  }

  async save(resumeId: string, { version, fileName, pdf }: StoredPdf): Promise<void> {
    const data = { version, fileName, pdf: new Uint8Array(pdf) };
    await this.db.resumePdf.upsert({ where: { resumeId }, create: { resumeId, ...data }, update: data });
  }
}
