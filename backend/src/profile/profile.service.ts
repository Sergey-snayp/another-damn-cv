import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EMPTY_CONTACT, CONTACT_KEYS, type ContactFields } from './profile.types';

/**
 * The person's own details — one row, never versioned.
 *
 * Deliberately separate from a resume's contact block. This is who you are and
 * what the extension types into application forms; a resume's header is part of
 * that document and versions with it, because a CV sent in March must not
 * change when you update your phone number in June.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** Created on demand, seeded from the Google account. */
  private async row(userId: string) {
    const existing = await this.prisma.profile.findUnique({ where: { userId } });
    if (existing) return existing;

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const [firstName = '', ...rest] = (user.name ?? '').split(' ');

    return this.prisma.profile.create({
      data: { userId, firstName, lastName: rest.join(' '), email: user.email },
    });
  }

  async get(userId: string): Promise<ContactFields> {
    const profile = await this.row(userId);

    const contact = Object.fromEntries(
      CONTACT_KEYS.map((key) => [key, (profile as Record<string, unknown>)[key] ?? '']),
    ) as unknown as ContactFields;

    // Derived, not stored: two places holding one fact drift, and the drift
    // only shows up on a real application.
    return { ...contact, ...(await this.derived(userId)), fullName: this.fullName(profile) };
  }

  async save(userId: string, incoming: Partial<ContactFields>): Promise<ContactFields> {
    await this.row(userId);

    const data: Record<string, string> = {};
    for (const key of CONTACT_KEYS) {
      // currentCompany, currentTitle and yearsExperience are computed.
      if (DERIVED.includes(key)) continue;
      if (key === 'fullName') continue;
      if (incoming[key] !== undefined) data[key] = String(incoming[key]);
    }

    if (incoming.fullName && !incoming.firstName && !incoming.lastName) {
      const [firstName = '', ...rest] = incoming.fullName.split(' ');
      data.firstName = firstName;
      data.lastName = rest.join(' ');
    }

    await this.prisma.profile.update({ where: { userId }, data });
    return this.get(userId);
  }

  /**
   * Current employer, title and total years follow from the primary resume's
   * live experience, so they are computed rather than maintained.
   */
  private async derived(userId: string) {
    const resume = await this.prisma.resume.findFirst({
      where: { profile: { userId } },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    });

    if (!resume) return { currentCompany: '', currentTitle: '', yearsExperience: '' };

    const roles = await this.prisma.experienceEntry.findMany({
      where: { resumeId: resume.id, supersededInSnapshot: null },
      orderBy: { position: 'asc' },
    });

    if (roles.length === 0) return { currentCompany: '', currentTitle: '', yearsExperience: '' };

    const current = roles.find((role) => role.current)
      ?? [...roles].sort((a, b) => (b.from ?? '').localeCompare(a.from ?? ''))[0]!;

    const earliest = roles.map((r) => r.from).filter(Boolean).sort()[0];
    const startYear = earliest ? Number(earliest.slice(0, 4)) : NaN;

    return {
      currentCompany: current.company,
      currentTitle: current.title,
      yearsExperience: Number.isFinite(startYear) && startYear > 1950
        ? String(Math.max(0, new Date().getFullYear() - startYear))
        : '',
    };
  }

  private fullName(profile: { firstName: string; lastName: string }): string {
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  }

  // ── the extension's bearer token ───────────────────────────────────────────

  async issueSyncToken(userId: string): Promise<string> {
    const syncToken = randomBytes(32).toString('base64url');
    await this.prisma.user.update({ where: { id: userId }, data: { syncToken } });
    return syncToken;
  }

  async currentSyncToken(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user?.syncToken ?? null;
  }

  async bySyncToken(token: string): Promise<ContactFields> {
    const user = await this.prisma.user.findUnique({ where: { syncToken: token } });
    // 401, not 404: the token is a credential, and a wrong one is not authorised.
    if (!user) throw new UnauthorizedException('Invalid sync token.');
    return this.get(user.id);
  }

  /** Only the flat fields ever reach the extension. */
  contactOnly(userId: string): Promise<ContactFields> {
    return this.get(userId);
  }
}

const DERIVED = ['currentCompany', 'currentTitle', 'yearsExperience'] as const as readonly string[];

export { EMPTY_CONTACT };
