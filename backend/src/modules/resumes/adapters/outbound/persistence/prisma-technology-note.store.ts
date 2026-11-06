import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type { TechnologyNoteStore } from '../../../application/use-cases/describe-technology';

export class PrismaTechnologyNoteStore implements TechnologyNoteStore {
  constructor(private readonly db: PrismaService) {}

  find(userId: string, key: string) {
    return this.db.technologyNote.findUnique({
      where: { userId_key: { userId, key } },
      select: { name: true, description: true },
    });
  }

  async save(userId: string, key: string, name: string, description: string): Promise<void> {
    await this.db.technologyNote.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, name, description },
      update: { name, description },
    });
  }
}
