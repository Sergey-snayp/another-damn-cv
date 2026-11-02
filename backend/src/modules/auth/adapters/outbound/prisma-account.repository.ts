import type { AccountRepository, GoogleAccount } from '../../application/ports/account-repository';
import type { PublicUser } from '../../contracts';
import type { PrismaService } from '../../../../shared/database/prisma.service';

const publicFields = { id: true, email: true, name: true, avatarUrl: true } as const;

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}
  upsertGoogleAccount(account: GoogleAccount): Promise<PublicUser> {
    return this.prisma.user.upsert({
      where: { googleId: account.googleId },
      create: {
        googleId: account.googleId,
        email: account.email,
        name: account.name ?? account.email.split('@')[0],
        avatarUrl: account.avatarUrl,
      },
      update: { email: account.email, name: account.name ?? undefined, avatarUrl: account.avatarUrl },
      select: publicFields,
    });
  }
  findById(userId: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: publicFields });
  }
  async replaceSyncToken(userId: string, token: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { syncToken: token } });
  }
  async currentSyncToken(userId: string): Promise<string | null> {
    return (
      (await this.prisma.user.findUnique({ where: { id: userId }, select: { syncToken: true } }))
        ?.syncToken ?? null
    );
  }
  async findIdBySyncToken(token: string): Promise<string | null> {
    return (
      (await this.prisma.user.findUnique({ where: { syncToken: token }, select: { id: true } }))?.id ?? null
    );
  }
}
