import { Prisma, type PrismaClient, type JobExtraction } from '@prisma/client';
import { JobConflictError, JobInputError, JobNotFoundError } from '../../../application/errors';
import { APPLIED_STATUSES } from '../../../domain/job';
import type {
  ApplicationDraft,
  ApplicationPreferences,
  ApplicationRepository,
} from '../../../application/ports/application-repository';
import type {
  JobChanges,
  JobRepository,
  NewJob,
  StatusChange,
} from '../../../application/ports/job-repository';
import type { JobReadingRepository } from '../../../application/ports/job-reading-repository';
import type { JobStatus } from '../../../domain/job';
import { jobFromRow, statusEventFromRow, statusToRow } from './job.mapper';

const newestEventFirst = [{ at: 'desc' }, { id: 'desc' }] as const;

export class PrismaJobRepository implements JobRepository, JobReadingRepository, ApplicationRepository {
  constructor(private readonly database: PrismaClient) {}

  async findOwned(userId: string, id: string) {
    const row = await this.database.job.findFirst({ where: { id, userId } });
    return row ? jobFromRow(row) : null;
  }

  async findByCanonicalUrl(userId: string, canonicalUrl: string) {
    const row = await this.database.job.findUnique({
      where: { userId_canonicalUrl: { userId, canonicalUrl } },
    });
    return row ? jobFromRow(row) : null;
  }

  async list(userId: string, status?: JobStatus) {
    const rows = await this.database.job.findMany({
      where: { userId, ...(status && { status: statusToRow(status) }) },
      omit: { html: true, pageText: true, structuredData: true, description: true },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => ({
      ...row,
      source: lower(row.source),
      status: lower(row.status),
      extraction: lower(row.extraction),
    }));
  }

  async history(userId: string, jobId: string) {
    const rows = await this.database.jobStatusEvent.findMany({
      where: { jobId, job: { userId } },
      orderBy: [...newestEventFirst],
    });
    return rows.map(statusEventFromRow);
  }

  async create(input: NewJob) {
    const { userId, source, extraction, canonicalUrl, ...fields } = input;
    const row = await this.database.job.create({
      data: {
        ...changesToRow(fields),
        userId,
        source: source.toUpperCase() as Uppercase<typeof source>,
        extraction: extractionToRow(extraction),
        canonicalUrl,
      },
    });
    return jobFromRow(row);
  }

  async update(userId: string, id: string, changes: JobChanges, statusChange?: StatusChange) {
    const data = changesToRow(changes);
    const row = statusChange
      ? await this.database.$transaction(async (tx) => {
          const event = await tx.jobStatusEvent.create({
            data: { jobId: id, from: statusToRow(statusChange.from), to: statusToRow(statusChange.to) },
          });
          const previous = await tx.job.findUniqueOrThrow({
            where: { id, userId },
            select: { appliedAt: true },
          });
          return tx.job.update({
            where: { id, userId },
            data: {
              ...data,
              ...(APPLIED_STATUSES.includes(statusChange.to) && !previous.appliedAt
                ? { appliedAt: event.at }
                : {}),
            },
          });
        })
      : await this.database.job.update({ where: { id, userId }, data });
    return jobFromRow(row);
  }

  async undoStatus(userId: string, id: string, eventId: string) {
    const row = await this.database.$transaction(async (tx) => {
      const latest = await tx.jobStatusEvent.findFirst({
        where: { jobId: id, job: { userId } },
        orderBy: [...newestEventFirst],
      });
      if (latest?.id !== eventId) throw new JobConflictError();
      const previous = await tx.job.findUniqueOrThrow({ where: { id, userId }, select: { appliedAt: true } });
      await tx.jobStatusEvent.delete({ where: { id: latest.id } });
      const firstApplied = await tx.jobStatusEvent.findFirst({
        where: { jobId: id, to: { in: APPLIED_STATUSES.map(statusToRow) } },
        orderBy: [{ at: 'asc' }, { id: 'asc' }],
      });
      return tx.job.update({
        where: { id, userId },
        data: {
          status: latest.from,
          appliedAt:
            firstApplied?.at ??
            (APPLIED_STATUSES.map(statusToRow).includes(latest.from) ? previous.appliedAt : null),
        },
      });
    });
    return jobFromRow(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.database.job.delete({ where: { id, userId } });
  }

  async createApplication(draft: ApplicationDraft) {
    try {
      return jobFromRow(await this.database.$transaction((tx) => createApplication(tx, draft)));
    } catch (error) {
      throw applicationWriteError(error);
    }
  }

  async exportApplications(userId: string) {
    return (await this.database.job.findMany({ where: { userId }, orderBy: { capturedAt: 'desc' } })).map(
      jobFromRow,
    );
  }

  async importApplications(userId: string, drafts: ApplicationDraft[]) {
    try {
      return await this.database.$transaction(
        async (tx) => {
          const urls = drafts.map(({ job }) => job.canonicalUrl).filter((url): url is string => !!url);
          const existing = await tx.job.findMany({
            where: { userId, canonicalUrl: { in: urls } },
            select: { canonicalUrl: true },
          });
          const seen = new Set(existing.map((row) => row.canonicalUrl));
          let imported = 0,
            skipped = 0;
          for (const draft of drafts) {
            if (draft.job.canonicalUrl && seen.has(draft.job.canonicalUrl)) {
              skipped++;
              continue;
            }
            await createApplication(tx, { ...draft, job: { ...draft.job, userId } });
            if (draft.job.canonicalUrl) seen.add(draft.job.canonicalUrl);
            imported++;
          }
          return { imported, skipped };
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      throw applicationWriteError(error);
    }
  }

  async updatePreferences(
    userId: string,
    ids: readonly string[],
    preferences: ApplicationPreferences,
    at: Date,
  ) {
    return this.database.$transaction(async (tx) => {
      const where = { userId, id: { in: [...ids] } };
      if ((await tx.job.count({ where })) !== ids.length) throw new JobNotFoundError();
      await tx.job.updateMany({
        where,
        data: {
          ...(preferences.favorite !== undefined ? { isFavorite: preferences.favorite } : {}),
          ...(preferences.archived !== undefined ? { archivedAt: preferences.archived ? at : null } : {}),
        },
      });
      return (await tx.job.findMany({ where })).map(jobFromRow);
    });
  }

  async pendingIds(): Promise<string[]> {
    const rows = await this.database.job.findMany({
      where: { extraction: 'PENDING' },
      select: { id: true },
      orderBy: { capturedAt: 'asc' },
    });
    return rows.map(({ id }) => id);
  }

  async findForReading(jobId: string) {
    const row = await this.database.job.findUnique({ where: { id: jobId } });
    return row ? jobFromRow(row) : null;
  }

  async readingState(jobId: string) {
    const row = await this.database.job.findUnique({
      where: { id: jobId },
      select: { editedFields: true, extraction: true },
    });
    return row ? { editedFields: row.editedFields, extraction: lower(row.extraction) } : null;
  }

  async finishReading(jobId: string, changes: JobChanges): Promise<void> {
    await this.database.job.update({ where: { id: jobId }, data: changesToRow(changes) });
  }
}

async function createApplication(tx: Prisma.TransactionClient, draft: ApplicationDraft) {
  const { userId, source, extraction, canonicalUrl, ...fields } = draft.job;
  const row = await tx.job.create({
    data: {
      ...changesToRow(fields),
      userId,
      canonicalUrl,
      source: source.toUpperCase() as Uppercase<typeof source>,
      extraction: extractionToRow(extraction),
    },
  });
  if (row.status !== 'SAVED')
    await tx.jobStatusEvent.create({
      data: { jobId: row.id, from: 'SAVED', to: row.status, at: draft.statusAt },
    });
  return row;
}

function applicationWriteError(error: unknown): unknown {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    ? new JobInputError('An application with that job link already exists.')
    : error;
}

function changesToRow(changes: JobChanges) {
  const { status, extraction, structuredData, ...fields } = changes;
  return {
    ...fields,
    ...(status !== undefined && { status: statusToRow(status) }),
    ...(extraction !== undefined && { extraction: extractionToRow(extraction) }),
    ...(structuredData !== undefined && {
      structuredData: structuredData === null ? Prisma.DbNull : (structuredData as Prisma.InputJsonValue),
    }),
  };
}

function extractionToRow(value: Lowercase<JobExtraction>): JobExtraction {
  return value.toUpperCase() as JobExtraction;
}

function lower<T extends string>(value: T): Lowercase<T> {
  return value.toLowerCase() as Lowercase<T>;
}
