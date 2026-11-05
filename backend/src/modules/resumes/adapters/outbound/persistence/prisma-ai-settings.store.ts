import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type { AiSettingsStore } from '../../../application/use-cases/resume-assistant';
import type { AiSettings } from '../../../domain/resume-assistant';

export class PrismaAiSettingsStore implements AiSettingsStore {
  constructor(private readonly db: PrismaService) {}

  async aiSettings(resumeId: string): Promise<unknown> {
    return (await this.db.resume.findUnique({ where: { id: resumeId }, select: { aiSettings: true } }))?.aiSettings ?? null;
  }

  async setAiSettings(resumeId: string, settings: AiSettings): Promise<void> {
    await this.db.resume.update({
      where: { id: resumeId },
      data: { aiSettings: settings as unknown as Prisma.InputJsonValue },
    });
  }
}
