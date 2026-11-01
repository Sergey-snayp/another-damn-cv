import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Job, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CAPTURED_PAGE_COLUMNS,
  toJobDto,
  toJobSummaryDto,
  toStatusEventDto,
  type JobDetailDto,
  type JobSummaryDto,
} from './jobs.dto';
import type { JobEditInput } from './jobs.schemas';
import { EDITABLE_FIELDS } from './jobs.types';

/** Newest move first; the id breaks ties between moves in the same millisecond. */
const NEWEST_EVENT_FIRST = [
  { at: 'desc' },
  { id: 'desc' },
] as const satisfies Prisma.JobStatusEventOrderByWithRelationInput[];

/**
 * Your jobs: listing, editing, and moving them through the pipeline.
 *
 * Getting jobs in (capture, paste, re-read) is JobCaptureService.
 */
@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, status?: JobStatus): Promise<JobSummaryDto[]> {
    const jobs = await this.prisma.job.findMany({
      where: { userId, ...(status && { status }) },
      omit: { ...CAPTURED_PAGE_COLUMNS, description: true },
      include: { resumes: { select: { id: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
    });
    return jobs.map(({ resumes, ...job }) => toJobSummaryDto(job, resumes[0]?.id ?? null));
  }

  async get(userId: string, id: string): Promise<JobDetailDto> {
    return this.detail(await this.findOwned(userId, id));
  }

  /**
   * Edits fields and/or moves the job.
   *
   * A move writes its event in the same transaction as the status, so the
   * history can never disagree with the board. Saving the status a job already
   * has records nothing. Every edited field is remembered, so a later capture
   * of the same page will not overwrite it.
   */
  async update(userId: string, id: string, edit: JobEditInput): Promise<JobDetailDto> {
    const job = await this.findOwned(userId, id);
    const { status, ...fields } = edit;

    const editedNow = EDITABLE_FIELDS.filter((key) => fields[key] !== undefined);
    const data: Prisma.JobUpdateInput = {
      ...fields,
      editedFields: [...new Set([...job.editedFields, ...editedNow])],
      ...(status && { status }),
    };
    const moved = status !== undefined && status !== job.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (moved) await tx.jobStatusEvent.create({ data: { jobId: id, from: job.status, to: status } });
      return tx.job.update({ where: { id }, data });
    });
    return this.detail(updated);
  }

  /**
   * Reverts a move, but only the job's latest one.
   *
   * An Undo clicked after the job moved again would otherwise put it back
   * somewhere neither move intended.
   */
  async undoStatus(userId: string, id: string, eventId: string): Promise<JobDetailDto> {
    await this.findOwned(userId, id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.jobStatusEvent.findFirst({ where: { jobId: id }, orderBy: NEWEST_EVENT_FIRST });
      if (latest?.id !== eventId) {
        throw new ConflictException('This job has moved since. Change its status instead.');
      }
      await tx.jobStatusEvent.delete({ where: { id: latest.id } });
      return tx.job.update({ where: { id }, data: { status: latest.from } });
    });
    return this.detail(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.job.delete({ where: { id } });
  }

  /** 404 for someone else's job too: whether an id exists is not theirs to learn. */
  async findOwned(userId: string, id: string): Promise<Job> {
    const job = await this.prisma.job.findFirst({ where: { id, userId } });
    if (!job) throw new NotFoundException('Job not found.');
    return job;
  }

  /** A job as the job page shows it: the job and its moves. */
  async detail(job: Job): Promise<JobDetailDto> {
    const events = await this.prisma.jobStatusEvent.findMany({
      where: { jobId: job.id },
      orderBy: NEWEST_EVENT_FIRST,
    });
    return { ...toJobDto(job), history: events.map(toStatusEventDto) };
  }
}
