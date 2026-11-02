import type { PrismaService } from '../../../../shared/database/prisma.service';
import type { ProfileRepository } from '../../application/ports/profile-repository';
import type { StoredContactKey, StoredProfile } from '../../domain/contact';

export class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly prisma: PrismaService) {}
  findByUserId(userId: string): Promise<StoredProfile | null> {
    return this.prisma.profile.findUnique({ where: { userId } });
  }
  create(
    userId: string,
    seed: { firstName: string; lastName: string; email: string },
  ): Promise<StoredProfile> {
    return this.prisma.profile.create({ data: { userId, ...seed } });
  }
  async update(userId: string, values: Partial<Record<StoredContactKey, string>>): Promise<void> {
    await this.prisma.profile.update({ where: { userId }, data: values });
  }
}
