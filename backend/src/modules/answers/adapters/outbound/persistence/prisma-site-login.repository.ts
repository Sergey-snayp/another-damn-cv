import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type { SiteLoginRepository, StoredSiteLogin } from '../../../application/ports/site-login';

const FIELDS = { email: true, sealedPassword: true, updatedAt: true } as const;

export class PrismaSiteLoginRepository implements SiteLoginRepository {
  constructor(private readonly db: PrismaService) {}

  find(userId: string): Promise<StoredSiteLogin | null> {
    return this.db.siteLogin.findUnique({ where: { userId }, select: FIELDS });
  }

  async sites(userId: string): Promise<string[]> {
    const rows = await this.db.siteAccount.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { host: true } });
    return rows.map((row) => row.host);
  }

  async addSite(userId: string, host: string): Promise<void> {
    await this.db.siteAccount.upsert({ where: { userId_host: { userId, host } }, create: { userId, host }, update: {} });
  }

  async findForSite(userId: string, host: string): Promise<StoredSiteLogin | null> {
    const row = await this.db.siteAccount.findUnique({ where: { userId_host: { userId, host } }, select: { email: true, sealedPassword: true, loginUpdatedAt: true } });
    return row?.email && row.sealedPassword && row.loginUpdatedAt ? { email: row.email, sealedPassword: row.sealedPassword, updatedAt: row.loginUpdatedAt } : null;
  }

  async saveForSite(userId: string, host: string, login: { email: string; sealedPassword: string } | null): Promise<StoredSiteLogin | null> {
    const fields = login ? { ...login, loginUpdatedAt: new Date() } : { email: null, sealedPassword: null, loginUpdatedAt: null };
    await this.db.siteAccount.upsert({ where: { userId_host: { userId, host } }, create: { userId, host, ...fields }, update: fields });
    return login ? this.findForSite(userId, host) : null;
  }

  async sitesWithOwnLogin(userId: string): Promise<string[]> {
    const rows = await this.db.siteAccount.findMany({ where: { userId, sealedPassword: { not: null } }, orderBy: { createdAt: 'asc' }, select: { host: true } });
    return rows.map((row) => row.host);
  }

  save(userId: string, login: { email: string; sealedPassword: string }): Promise<StoredSiteLogin> {
    return this.db.siteLogin.upsert({
      where: { userId },
      create: { userId, ...login },
      update: login,
      select: FIELDS,
    });
  }
}
