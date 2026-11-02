import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type {
  CreateResumeRecord,
  ResumeRepository,
  ResumeTransaction,
  SectionChangeRows,
} from '../../../application/ports/resume-repository';
import {
  VERSIONED_TABLES,
  type Contact,
  type Experience,
  type Achievement,
  type Education,
  type Skill,
  type Summary,
  type RenderedResume,
  type ResumeRecord,
  type ResumeSummary,
  type SectionRows,
  type Snapshot,
  type VersionedRow,
  type VersionedTable,
} from '../../../domain/resume';

interface RowDelegate {
  findMany(input: {
    where: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }): Promise<VersionedRow[]>;
  create(input: { data: Record<string, unknown> }): Promise<unknown>;
  update(input: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
}
function table(client: Prisma.TransactionClient, name: VersionedTable): RowDelegate {
  return client[name] as unknown as RowDelegate;
}
/** Preserve every returned column, including legacy JSON and version metadata. */
function mappedRows<T extends VersionedRow>(rows: VersionedRow[]): T[] {
  return rows.map((row) => ({ ...row }) as T);
}
class PrismaResumeTransaction implements ResumeTransaction {
  constructor(protected readonly client: Prisma.TransactionClient) {}
  async find(id: string): Promise<ResumeRecord | null> {
    return this.client.resume.findUnique({ where: { id } });
  }
  async sections(resumeId: string, atSnapshot?: number): Promise<SectionRows> {
    const where: Record<string, unknown> =
      atSnapshot === undefined
        ? { resumeId, supersededInSnapshot: null }
        : {
            resumeId,
            createdInSnapshot: { lte: atSnapshot },
            OR: [{ supersededInSnapshot: null }, { supersededInSnapshot: { gt: atSnapshot } }],
          };
    const ordered = { where, orderBy: { position: 'asc' as const } };
    const contact = await table(this.client, 'contactInformation').findMany({ where });
    return {
      contact: mappedRows<Contact>(contact)[0] ?? null,
      experiences: mappedRows<Experience>(await table(this.client, 'experienceEntry').findMany(ordered)),
      achievements: mappedRows<Achievement>(await table(this.client, 'achievement').findMany(ordered)),
      educations: mappedRows<Education>(await table(this.client, 'educationEntry').findMany(ordered)),
      skills: mappedRows<Skill>(await table(this.client, 'skillEntry').findMany(ordered)),
      summaries: mappedRows<Summary>(await table(this.client, 'summaryVariant').findMany({ where })),
    };
  }
  liveRows(resumeId: string, name: VersionedTable): Promise<VersionedRow[]> {
    return table(this.client, name).findMany({ where: { resumeId, supersededInSnapshot: null } });
  }
  async openRow(name: VersionedTable, content: Record<string, unknown>): Promise<void> {
    await table(this.client, name).create({ data: content });
  }
  async closeRow(name: VersionedTable, id: string, number: number): Promise<void> {
    await table(this.client, name).update({ where: { id }, data: { supersededInSnapshot: number } });
  }
  latestSnapshot(resumeId: string): Promise<Snapshot | null> {
    return this.client.snapshot.findFirst({ where: { resumeId }, orderBy: { number: 'desc' } });
  }
  createSnapshot(resumeId: string, number: number, message?: string): Promise<Snapshot> {
    return this.client.snapshot.create({ data: { resumeId, number, message } });
  }
  async materialise(resumeId: string, document: RenderedResume, snapshotId: string | null): Promise<void> {
    await this.client.resume.update({
      where: { id: resumeId },
      data: {
        current: document as unknown as Prisma.InputJsonValue,
        currentSnapshotId: snapshotId,
        materialisedAt: new Date(),
      },
    });
  }
}
export class PrismaResumeRepository extends PrismaResumeTransaction implements ResumeRepository {
  constructor(private readonly database: PrismaService) {
    super(database);
  }
  transaction<T>(work: (tx: ResumeTransaction) => Promise<T>): Promise<T> {
    return this.database.$transaction((tx) => work(new PrismaResumeTransaction(tx)), { timeout: 20_000 });
  }
  findOwned(userId: string, id: string): Promise<ResumeRecord | null> {
    return this.client.resume.findFirst({ where: { id, profile: { userId } } });
  }
  async list(profileId: string): Promise<ResumeSummary[]> {
    const rows = await this.client.resume.findMany({
      where: { profileId },
      select: {
        id: true,
        name: true,
        targetRole: true,
        isPrimary: true,
        currentSnapshotId: true,
        createdAt: true,
        updatedAt: true,
        jobId: true,
        sourceResumeId: true,
        tailoring: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(({ tailoring, ...row }) => ({ ...row, hasTailoring: tailoring !== null }));
  }
  create(input: CreateResumeRecord): Promise<ResumeRecord> {
    return this.client.resume.create({ data: input });
  }
  history(resumeId: string, name: VersionedTable, lineageId: string): Promise<VersionedRow[]> {
    return table(this.client, name).findMany({
      where: { resumeId, lineageId },
      orderBy: { createdInSnapshot: 'desc' },
    });
  }
  snapshots(resumeId: string): Promise<Snapshot[]> {
    return this.client.snapshot.findMany({ where: { resumeId }, orderBy: { number: 'desc' } });
  }
  snapshot(resumeId: string, number: number): Promise<Snapshot | null> {
    return this.client.snapshot.findFirst({ where: { resumeId, number } });
  }
  async changesAt(resumeId: string, number: number): Promise<SectionChangeRows[]> {
    const rows: SectionChangeRows[] = [];
    for (const name of VERSIONED_TABLES)
      rows.push({
        table: name,
        opened: await table(this.client, name).findMany({ where: { resumeId, createdInSnapshot: number } }),
        closed: await table(this.client, name).findMany({
          where: { resumeId, supersededInSnapshot: number },
        }),
      });
    return rows;
  }
  copyForJob(profileId: string, jobId: string): Promise<ResumeRecord | null> {
    return this.client.resume.findFirst({ where: { profileId, jobId }, orderBy: { createdAt: 'desc' } });
  }
  pickSource(profileId: string, sourceResumeId?: string): Promise<ResumeRecord | null> {
    if (sourceResumeId) return this.client.resume.findFirst({ where: { id: sourceResumeId, profileId } });
    return this.client.resume.findFirst({
      where: { profileId, OR: [{ isPrimary: true }, { currentSnapshotId: { not: null }, jobId: null }] },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    });
  }
  async proposal(resumeId: string, proposal: unknown): Promise<void> {
    await this.client.resume.update({
      where: { id: resumeId },
      data: { tailoring: proposal === null ? Prisma.DbNull : (proposal as Prisma.InputJsonValue) },
    });
  }
  async careerRows(userId: string): Promise<Experience[]> {
    const resume = await this.client.resume.findFirst({
      where: { profile: { userId } },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!resume) return [];
    return mappedRows<Experience>(
      await table(this.client, 'experienceEntry').findMany({
        where: { resumeId: resume.id, supersededInSnapshot: null },
        orderBy: { position: 'asc' },
      }),
    );
  }
  async latestIdsForJobs(userId: string, jobIds: readonly string[]): Promise<Record<string, string>> {
    if (!jobIds.length) return {};
    const rows = await this.client.resume.findMany({
      where: { profile: { userId }, jobId: { in: [...jobIds] } },
      select: { id: true, jobId: true },
      orderBy: { createdAt: 'desc' },
    });
    const ids: Record<string, string> = {};
    for (const row of rows) if (row.jobId && !ids[row.jobId]) ids[row.jobId] = row.id;
    return ids;
  }
}
