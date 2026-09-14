import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ResumeChanges, RenderedResume, RenderedExperience, Versioned,
} from './resume.types';

type Tx = Prisma.TransactionClient;

/** The versioned tables, all of which share the same four columns. */
const SECTIONS = [
  'contactInformation', 'experienceEntry', 'achievement',
  'educationEntry', 'skillEntry', 'summaryVariant',
] as const;

/**
 * Versioned resumes.
 *
 * A save opens a snapshot, closes whatever changed, writes successors, and
 * rebuilds the materialised projection — all in one transaction. Rows that did
 * not change are never touched, which is what makes this cheaper than copying
 * the document.
 */
@Injectable()
export class ResumeService {
  constructor(private readonly prisma: PrismaService) {}

  // ── reading ────────────────────────────────────────────────────────────────

  /**
   * The live resume, from the materialised projection — one row, no joins.
   * Falls back to rebuilding if the projection was never built.
   */
  async current(resumeId: string): Promise<RenderedResume> {
    const resume = await this.prisma.resume.findUnique({ where: { id: resumeId } });
    if (!resume) throw new NotFoundException('No such resume.');

    if (resume.current && resume.materialisedAt) {
      return resume.current as unknown as RenderedResume;
    }

    return this.rebuild(resumeId);
  }

  /**
   * The resume as it stood at a given snapshot.
   *
   * A row lives from the snapshot it appeared in until the one that replaced
   * it, so this is a range test rather than a lookup.
   */
  async atSnapshot(resumeId: string, number: number): Promise<RenderedResume> {
    const alive = { createdInSnapshot: { lte: number } };
    const notYetGone = {
      OR: [{ supersededInSnapshot: null }, { supersededInSnapshot: { gt: number } }],
    };
    const where = { resumeId, ...alive, ...notYetGone };

    return this.assemble(number, {
      contact: await this.prisma.contactInformation.findFirst({ where }),
      experiences: await this.prisma.experienceEntry.findMany({ where, orderBy: { position: 'asc' } }),
      achievements: await this.prisma.achievement.findMany({ where, orderBy: { position: 'asc' } }),
      educations: await this.prisma.educationEntry.findMany({ where, orderBy: { position: 'asc' } }),
      skills: await this.prisma.skillEntry.findMany({ where }),
      summaries: await this.prisma.summaryVariant.findMany({ where }),
    });
  }

  /** Every version of one entry, newest first. */
  async history(table: (typeof SECTIONS)[number], lineageId: string) {
    const rows = await (this.prisma[table] as never as {
      findMany(a: unknown): Promise<Record<string, unknown>[]>;
    }).findMany({
      where: { lineageId },
      orderBy: { createdInSnapshot: 'desc' },
    });

    return rows;
  }

  async snapshots(resumeId: string) {
    return this.prisma.snapshot.findMany({
      where: { resumeId },
      orderBy: { number: 'desc' },
    });
  }

  // ── writing ────────────────────────────────────────────────────────────────

  async create(profileId: string, name: string, targetRole?: string) {
    return this.prisma.resume.create({ data: { profileId, name, targetRole } });
  }

  /**
   * One save = one snapshot.
   *
   * Everything happens in a single transaction: if the projection cannot be
   * rebuilt, the snapshot never existed either.
   */
  async save(resumeId: string, changes: ResumeChanges, message?: string): Promise<RenderedResume> {
    return this.prisma.$transaction(async (tx) => {
      const number = await this.nextSnapshotNumber(tx, resumeId);
      let touched = false;

      if (changes.contact) {
        touched = await this.applySingle(tx, 'contactInformation', resumeId, number, changes.contact) || touched;
      }
      if (changes.experiences) {
        touched = await this.applyList(tx, 'experienceEntry', resumeId, number, changes.experiences) || touched;
      }
      if (changes.achievements) {
        touched = await this.applyList(tx, 'achievement', resumeId, number, changes.achievements) || touched;
      }
      if (changes.educations) {
        touched = await this.applyList(tx, 'educationEntry', resumeId, number, changes.educations) || touched;
      }
      if (changes.skills) {
        touched = await this.applyList(tx, 'skillEntry', resumeId, number, changes.skills) || touched;
      }
      if (changes.summaries) {
        touched = await this.applyList(tx, 'summaryVariant', resumeId, number, changes.summaries) || touched;
      }

      // A Save that changed nothing must not create a version, or the history
      // fills with identical entries nobody can navigate.
      if (!touched) {
        return this.current(resumeId);
      }

      const snapshot = await tx.snapshot.create({ data: { resumeId, number, message } });
      return this.materialise(tx, resumeId, number, snapshot.id);
    }, { timeout: 20_000 });
  }

  /**
   * Roll back by moving forward: snapshot N's content becomes a NEW snapshot.
   * History is never rewritten — the same reason `git revert` beats a reset.
   */
  async revertTo(resumeId: string, number: number): Promise<RenderedResume> {
    const past = await this.atSnapshot(resumeId, number);

    return this.save(resumeId, {
      contact: past.contact as never,
      experiences: past.experiences.map(stripRuntime) as never,
      achievements: past.experiences.flatMap((e) => e.achievements.map(stripRuntime)) as never,
      educations: past.educations.map(stripRuntime) as never,
      skills: past.skills.map(stripRuntime) as never,
      summaries: Object.entries(past.summaries).map(([variant, text]) => ({ variant, text })) as never,
    }, `revert to snapshot ${number}`);
  }

  // ── projection ─────────────────────────────────────────────────────────────

  /**
   * Rebuilds Resume.current from the live rows.
   *
   * The projection is derived, never authored — so a suspected drift is fixed
   * by calling this, not by investigating which copy is right.
   */
  async rebuild(resumeId: string): Promise<RenderedResume> {
    const resume = await this.prisma.resume.findUnique({ where: { id: resumeId } });
    if (!resume) throw new NotFoundException('No such resume.');

    const latest = await this.prisma.snapshot.findFirst({
      where: { resumeId }, orderBy: { number: 'desc' },
    });

    return this.materialise(this.prisma, resumeId, latest?.number ?? 0, latest?.id ?? null);
  }

  private async materialise(
    tx: Tx | PrismaService, resumeId: string, number: number, snapshotId: string | null,
  ): Promise<RenderedResume> {
    const live = { resumeId, supersededInSnapshot: null };

    const rendered = this.assemble(number, {
      contact: await tx.contactInformation.findFirst({ where: live }),
      experiences: await tx.experienceEntry.findMany({ where: live, orderBy: { position: 'asc' } }),
      achievements: await tx.achievement.findMany({ where: live, orderBy: { position: 'asc' } }),
      educations: await tx.educationEntry.findMany({ where: live, orderBy: { position: 'asc' } }),
      skills: await tx.skillEntry.findMany({ where: live }),
      summaries: await tx.summaryVariant.findMany({ where: live }),
    });

    await tx.resume.update({
      where: { id: resumeId },
      data: {
        current: rendered as unknown as Prisma.InputJsonValue,
        currentSnapshotId: snapshotId,
        materialisedAt: new Date(),
      },
    });

    return rendered;
  }

  /** Nests achievements under their role by lineage, never by version id. */
  private assemble(number: number, rows: {
    contact: Record<string, unknown> | null;
    experiences: Record<string, unknown>[];
    achievements: Record<string, unknown>[];
    educations: Record<string, unknown>[];
    skills: Record<string, unknown>[];
    summaries: Record<string, unknown>[];
  }): RenderedResume {
    const byExperience = new Map<string, Record<string, unknown>[]>();

    for (const achievement of rows.achievements) {
      const key = achievement.experienceLineageId as string;
      if (!byExperience.has(key)) byExperience.set(key, []);
      byExperience.get(key)!.push(achievement);
    }

    return {
      snapshot: number,
      contact: rows.contact,
      experiences: rows.experiences.map((experience) => ({
        ...experience,
        lineageId: experience.lineageId as string,
        achievements: byExperience.get(experience.lineageId as string) ?? [],
      })) as RenderedExperience[],
      educations: rows.educations,
      skills: rows.skills,
      summaries: Object.fromEntries(
        rows.summaries.map((s) => [s.variant as string, s.text as string]),
      ),
    };
  }

  // ── the versioning mechanics ───────────────────────────────────────────────

  private async nextSnapshotNumber(tx: Tx, resumeId: string): Promise<number> {
    const latest = await tx.snapshot.findFirst({
      where: { resumeId }, orderBy: { number: 'desc' },
    });
    return (latest?.number ?? 0) + 1;
  }

  /** A section with at most one live row, such as the contact block. */
  private async applySingle(
    tx: Tx, table: 'contactInformation', resumeId: string, number: number, input: Versioned,
  ): Promise<boolean> {
    const existing = await tx[table].findFirst({ where: { resumeId, supersededInSnapshot: null } });

    if (existing && !this.differs(existing, input)) return false;

    if (existing) {
      await tx[table].update({
        where: { id: existing.id },
        data: { supersededInSnapshot: number },
      });
    }

    await tx[table].create({
      data: {
        ...(input as object),
        lineageId: existing?.lineageId ?? input.lineageId ?? randomUUID(),
        resumeId,
        createdInSnapshot: number,
      } as never,
    });

    return true;
  }

  /**
   * A list section.
   *
   * An entry present in the input is created or updated; one that exists live
   * but is absent from the input is closed with no successor — which is how a
   * deletion is recorded.
   */
  private async applyList(
    tx: Tx,
    table: 'experienceEntry' | 'achievement' | 'educationEntry' | 'skillEntry' | 'summaryVariant',
    resumeId: string, number: number, inputs: Versioned[],
  ): Promise<boolean> {
    const live = await (tx[table] as never as {
      findMany(a: unknown): Promise<Record<string, unknown>[]>;
    }).findMany({ where: { resumeId, supersededInSnapshot: null } });

    const liveByLineage = new Map(live.map((row) => [row.lineageId as string, row]));
    const seen = new Set<string>();
    let touched = false;

    for (const [index, input] of inputs.entries()) {
      const lineageId = input.lineageId ?? randomUUID();
      seen.add(lineageId);

      const existing = liveByLineage.get(lineageId);
      const payload = { ...(input as object), position: (input as { position?: number }).position ?? index };

      if (existing && !this.differs(existing, payload)) continue;

      if (existing) {
        await (tx[table] as never as { update(a: unknown): Promise<unknown> })
          .update({ where: { id: existing.id }, data: { supersededInSnapshot: number } });
      }

      await (tx[table] as never as { create(a: unknown): Promise<unknown> })
        .create({ data: { ...payload, lineageId, resumeId, createdInSnapshot: number } });

      touched = true;
    }

    // Closed with no successor: a deletion.
    for (const [lineageId, row] of liveByLineage) {
      if (seen.has(lineageId)) continue;

      await (tx[table] as never as { update(a: unknown): Promise<unknown> })
        .update({ where: { id: row.id }, data: { supersededInSnapshot: number } });

      touched = true;
    }

    return touched;
  }

  /** Compares only the fields the caller supplied, ignoring bookkeeping columns. */
  private differs(existing: Record<string, unknown>, input: object): boolean {
    for (const [key, value] of Object.entries(input)) {
      if (['lineageId', 'resumeId', 'id', 'createdInSnapshot', 'supersededInSnapshot'].includes(key)) {
        continue;
      }
      if (value === undefined) continue;

      const before = existing[key] ?? null;
      const after = value ?? null;

      if (JSON.stringify(before) !== JSON.stringify(after)) return true;
    }
    return false;
  }
}

/** Drops the columns a past version carried that a new one must not reuse. */
function stripRuntime(row: Record<string, unknown>): Record<string, unknown> {
  const { id, resumeId, createdInSnapshot, supersededInSnapshot, achievements, ...rest } = row;
  return rest;
}
