import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EMPTY_PROFILE, CONTACT_KEYS,
  type CandidateProfile, type ContactFields,
  type ExperienceEntry, type EducationEntry,
} from './profile.types';

type Json = Record<string, unknown>;

/**
 * The candidate profile lives inside the user's fact base, under `contact`,
 * `profile`, `experience` and `education`.
 *
 * One source of truth: the name and employer on an application form are the
 * same ones a generated CV prints. Separate tables would drift apart, and the
 * drift would only show up on a real application.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<CandidateProfile> {
    const row = await this.prisma.factBase.findUnique({ where: { userId } });
    if (!row) return structuredClone(EMPTY_PROFILE);

    const data = (row.data ?? {}) as Json;
    const contact = (data.contact ?? {}) as Record<string, string>;
    const profile = (data.profile ?? {}) as Record<string, string>;

    const fullName = profile.name ?? '';
    const [firstName = '', ...rest] = fullName.split(' ');

    const flat = Object.fromEntries(
      CONTACT_KEYS.map((key) => [key, contact[key] ?? '']),
    ) as unknown as ContactFields;

    return {
      ...flat,
      fullName,
      firstName: contact.firstName || firstName,
      lastName: contact.lastName || rest.join(' '),
      experience: this.readExperience(data),
      education: this.readEducation(data),
    };
  }

  /**
   * Accepts both shapes. A fact base imported from the CV JSON stores roles
   * under `projects` with richer fields; the form writes the simpler
   * `experience`. Reading both means an import is usable immediately.
   */
  private readExperience(data: Json): ExperienceEntry[] {
    if (Array.isArray(data.experience)) return data.experience as ExperienceEntry[];

    const projects = Array.isArray(data.projects) ? data.projects : [];

    return projects.map((raw) => {
      const p = raw as Record<string, string>;
      return {
        id: p.id ?? randomUUID(),
        company: p.company ?? p.client ?? '',
        title: p.employmentTitle ?? p.role ?? '',
        from: p.dates ?? '',
        to: '',
        current: false,
        description: p.blurb ?? '',
      };
    });
  }

  private readEducation(data: Json): EducationEntry[] {
    const rows = Array.isArray(data.education) ? data.education : [];

    return rows.map((raw) => {
      const e = raw as Record<string, string>;
      return {
        id: e.id ?? randomUUID(),
        institution: e.institution ?? e.school ?? '',
        degree: e.degree ?? '',
        field: e.field ?? '',
        from: e.from ?? String(e.start ?? ''),
        to: e.to ?? String(e.end ?? ''),
      };
    });
  }

  /**
   * Current employer, title and total years all follow from the experience
   * list, so they are computed rather than typed.
   *
   * Forms still ask for them separately — Greenhouse has a "current company"
   * box — so they stay in the contact fields the extension fills. They just
   * stop being something you maintain by hand, and therefore stop drifting out
   * of step with the history below them.
   */
  private derive(experience: ExperienceEntry[]): Pick<ContactFields, 'currentCompany' | 'currentTitle' | 'yearsExperience'> {
    const current = experience.find((role) => role.current)
      ?? [...experience].sort((a, b) => (b.from ?? '').localeCompare(a.from ?? ''))[0];

    const starts = experience
      .map((role) => role.from)
      .filter((from): from is string => Boolean(from))
      .sort();

    let years = '';
    const earliest = starts[0];

    if (earliest) {
      const year = Number(earliest.slice(0, 4));
      if (Number.isFinite(year) && year > 1950) {
        years = String(Math.max(0, new Date().getFullYear() - year));
      }
    }

    return {
      currentCompany: current?.company ?? '',
      currentTitle: current?.title ?? '',
      yearsExperience: years,
    };
  }

  /** Merges. A profile save must never drop skills, projects or achievements. */
  async save(userId: string, incoming: Partial<CandidateProfile>): Promise<CandidateProfile> {
    const row = await this.prisma.factBase.findUnique({ where: { userId } });
    const data = ((row?.data ?? {}) as Json);

    const existingProfile = (data.profile ?? {}) as Json;
    const existingContact = (data.contact ?? {}) as Record<string, string>;

    const contact: Record<string, string> = { ...existingContact };
    for (const key of CONTACT_KEYS) {
      if (incoming[key] !== undefined) contact[key] = String(incoming[key]);
    }

    const fullName = incoming.fullName
      || [incoming.firstName, incoming.lastName].filter(Boolean).join(' ')
      || (existingProfile.name as string | undefined)
      || '';

    const experience = incoming.experience ?? this.readExperience(data);

    const merged = {
      ...data,
      profile: { ...existingProfile, name: fullName },
      contact: { ...contact, fullName, ...this.derive(experience) },
      experience,
      education: incoming.education ?? this.readEducation(data),
    } as unknown as Prisma.InputJsonValue;

    await this.prisma.factBase.upsert({
      where: { userId },
      create: { userId, data: merged },
      update: { data: merged },
    });

    return this.get(userId);
  }

  /** Only the flat fields go to the extension — never employment history. */
  async contactOnly(userId: string): Promise<ContactFields> {
    const full = await this.get(userId);
    return Object.fromEntries(
      CONTACT_KEYS.map((key) => [key, full[key]]),
    ) as unknown as ContactFields;
  }

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
    return this.contactOnly(user.id);
  }
}
