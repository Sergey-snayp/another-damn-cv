import {
  BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, type Resume } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { ResumeService } from './resume.service';
import type { RenderedResume, ResumeChanges } from './resume.types';
import {
  TAILOR_SYSTEM, applyRetry, blockedLines, readTailoring, retryPrompt, tailorPrompt, type Tailoring,
} from './tailoring';

/**
 * "Tailor resume for this job".
 *
 * Works on a copy, one per job, so the resume it came from never changes. The
 * model's suggestions are stored on the copy and nothing reaches the resume
 * until a person accepts it and saves.
 */
@Injectable()
export class TailorResumeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resumes: ResumeService,
    private readonly llm: LlmService,
  ) {}

  async tailorForJob(userId: string, jobId: string, sourceResumeId?: string): Promise<{ resumeId: string; tailoring: Tailoring }> {
    const job = await this.prisma.job.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('No such job.');
    if (job.extraction === 'PENDING') {
      throw new ConflictException('The job page is still being read. Try again in a moment.');
    }
    if (!job.description?.trim()) {
      throw new BadRequestException('This job has no description to tailor to. Add one first.');
    }

    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new BadRequestException('Make a resume first.');

    const copy = await this.prisma.resume.findFirst({
      where: { jobId, profileId: profile.id }, orderBy: { createdAt: 'desc' },
    }) ?? await this.copyFor(profile.id, job, sourceResumeId);

    const resume = await this.resumes.current(copy.id);
    if (resume.experiences.length === 0 && Object.keys(resume.summaries).length === 0) {
      throw new BadRequestException('That resume is empty. Fill it in, then tailor it.');
    }

    const forPrompt = { id: job.id, title: job.title, company: job.company, description: job.description };
    const { prompt, ids } = tailorPrompt(resume, forPrompt);
    const answer = await this.llm.complete(prompt, TAILOR_SYSTEM, { timeoutMs: 300_000 });
    const read = readTailoring(answer, resume, forPrompt, ids);
    if (!read) throw new ServiceUnavailableException('The AI answer could not be read. Try again.');

    let tailoring: Tailoring = {
      ...read,
      jobId: job.id,
      jobTitle: job.title ?? job.pageTitle ?? 'this job',
      company: job.company,
      createdAt: new Date().toISOString(),
    };

    // One more try for lines thrown out by the check, naming the words to drop.
    // If that fails too, the originals stand; the suggestions are still usable.
    const blocked = blockedLines(tailoring);
    if (blocked.length > 0) {
      try {
        const retry = await this.llm.complete(retryPrompt(blocked), TAILOR_SYSTEM, { timeoutMs: 120_000 });
        tailoring = applyRetry(retry, tailoring, resume, forPrompt);
      } catch {
        // keep the first answer
      }
    }

    await this.prisma.resume.update({
      where: { id: copy.id },
      data: { tailoring: tailoring as unknown as Prisma.InputJsonValue },
    });

    return { resumeId: copy.id, tailoring };
  }

  async pending(userId: string, resumeId: string): Promise<{ tailoring: Tailoring | null }> {
    const resume = await this.owned(userId, resumeId);
    return { tailoring: (resume.tailoring as unknown as Tailoring | null) ?? null };
  }

  async discard(userId: string, resumeId: string): Promise<void> {
    await this.owned(userId, resumeId);
    await this.prisma.resume.update({ where: { id: resumeId }, data: { tailoring: Prisma.DbNull } });
  }

  // --- the copy -----------------------------------------------------------------

  /**
   * A full copy under new lineage ids.
   *
   * New ids, not shared ones: entry history is looked up by lineage, and a
   * shared id would mix the two resumes' histories together.
   */
  private async copyFor(
    profileId: string,
    job: { id: string; title: string | null; company: string | null; pageTitle: string | null },
    sourceResumeId?: string,
  ): Promise<Resume> {
    const source = await this.pickSource(profileId, sourceResumeId);
    const from = await this.resumes.current(source.id);

    const title = job.title ?? job.pageTitle ?? 'Job';
    const copy = await this.prisma.resume.create({
      data: {
        profileId,
        name: job.company ? `${title} — ${job.company}` : title,
        targetRole: job.title,
        jobId: job.id,
        sourceResumeId: source.id,
      },
    });

    await this.resumes.save(copy.id, copyOf(from), `Copied from "${source.name}"`);
    return copy;
  }

  /** The chosen resume, else the main one, else the latest with content. */
  private async pickSource(profileId: string, sourceResumeId?: string): Promise<Resume> {
    if (sourceResumeId) {
      const chosen = await this.prisma.resume.findFirst({ where: { id: sourceResumeId, profileId } });
      if (!chosen) throw new NotFoundException('No such resume.');
      return chosen;
    }

    const source = await this.prisma.resume.findFirst({
      where: { profileId, OR: [{ isPrimary: true }, { currentSnapshotId: { not: null }, jobId: null }] },
      orderBy: [{ isPrimary: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!source) throw new BadRequestException('Make a resume first.');
    return source;
  }

  private async owned(userId: string, resumeId: string): Promise<Resume> {
    const resume = await this.prisma.resume.findFirst({ where: { id: resumeId, profile: { userId } } });
    if (!resume) throw new NotFoundException('No such resume.');
    return resume;
  }
}

/** Everything in `from`, under fresh lineage ids, as one save. */
export function copyOf(from: RenderedResume): ResumeChanges {
  const roleIds = new Map(from.experiences.map((e) => [e.lineageId, randomUUID()]));
  const clean = (row: Record<string, unknown>) => {
    const { id, resumeId, createdInSnapshot, supersededInSnapshot, achievements, lineageId, ...rest } = row;
    return rest;
  };

  return {
    contact: from.contact ? clean(from.contact) as never : undefined,
    experiences: from.experiences.map((e) => ({ ...clean(e), lineageId: roleIds.get(e.lineageId) })) as never,
    achievements: from.experiences.flatMap((e) => e.achievements.map((a) => ({
      ...clean(a), experienceLineageId: roleIds.get(e.lineageId)!,
    }))) as never,
    educations: from.educations.map(clean) as never,
    skills: from.skills.map(clean) as never,
    summaries: Object.entries(from.summaries).map(([variant, text]) => ({ variant, text })),
  };
}
