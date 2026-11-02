import { Prisma, type PrismaClient, type JobExtraction } from '@prisma/client';
import { JobConflictError } from '../../../application/errors';
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

export class PrismaJobRepository implements JobRepository, JobReadingRepository {
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
          await tx.jobStatusEvent.create({
            data: { jobId: id, from: statusToRow(statusChange.from), to: statusToRow(statusChange.to) },
          });
          return tx.job.update({ where: { id, userId }, data });
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
      await tx.jobStatusEvent.delete({ where: { id: latest.id } });
      return tx.job.update({ where: { id, userId }, data: { status: latest.from } });
    });
    return jobFromRow(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.database.job.delete({ where: { id, userId } });
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
