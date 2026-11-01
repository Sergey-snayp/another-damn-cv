import { BadRequestException, Injectable } from '@nestjs/common';
import { JobExtraction, JobSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalUrl } from './canonical-url';
import { fieldColumns } from './job-fields';
import { JobReaderService } from './job-reader.service';
import { toJobDto, type JobDetailDto, type JobDto } from './jobs.dto';
import type { CaptureInput, ManualJobInput } from './jobs.schemas';
import { JobsService } from './jobs.service';
import type { JobFields } from './jobs.types';
import { tidy } from './html-text';
import { jobFromJsonLd } from './structured-data';

interface FirstRead {
  extraction: JobExtraction;
  fields: JobFields;
}

/**
 * Getting jobs in: sent from the extension, pasted by hand, or read again.
 *
 * A page's own JSON-LD is used when it has one; otherwise the page text goes
 * to the model in the background (JobReaderService).
 */
@Injectable()
export class JobCaptureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly reader: JobReaderService,
  ) {}

  /**
   * Saves the page the extension sent. Sending the same job again (by its
   * canonical address) updates it, and never overwrites a field you edited.
   */
  async capture(userId: string, input: CaptureInput): Promise<{ job: JobDto; created: boolean }> {
    const canonical = canonicalUrl(input.url);
    if (!canonical) throw new BadRequestException('That page has no web address a job can be saved under.');

    const pageText = input.text ? tidy(input.text) : '';
    const existing = await this.prisma.job.findUnique({
      where: { userId_canonicalUrl: { userId, canonicalUrl: canonical } },
    });
    const read = firstRead(input.jsonLd, pageText);

    const data = {
      url: input.url,
      pageTitle: input.pageTitle ?? null,
      html: input.html ?? null,
      pageText: pageText || null,
      structuredData: input.jsonLd?.length ? (input.jsonLd as Prisma.InputJsonValue) : Prisma.DbNull,
      extraction: read.extraction,
      extractionError:
        read.extraction === JobExtraction.FAILED ? 'Nothing readable was captured from that page.' : null,
      capturedAt: new Date(),
      // Re-sending a job the model already read keeps its fields until the new
      // read lands, rather than blanking them for the minute it takes.
      ...(existing && read.extraction === JobExtraction.PENDING
        ? {}
        : fieldColumns(read.fields, new Set(existing?.editedFields))),
    };

    const job = existing
      ? await this.prisma.job.update({ where: { id: existing.id }, data })
      : await this.prisma.job.create({
          data: { ...data, userId, source: JobSource.EXTENSION, canonicalUrl: canonical, editedFields: [] },
        });

    if (job.extraction === JobExtraction.PENDING) this.reader.enqueue(job.id);
    return { job: toJobDto(job), created: !existing };
  }

  /** A pasted posting. Title and company are read by the model when left out. */
  async createManual(userId: string, input: ManualJobInput): Promise<JobDto> {
    const description = tidy(input.description);
    const canonical = input.url ? canonicalUrl(input.url) : null;
    if (input.url && !canonical) throw new BadRequestException('That link is not a valid web address.');
    if (canonical && (await this.isSaved(userId, canonical))) {
      throw new BadRequestException('That job is already saved.');
    }

    const title = input.title ?? null;
    const company = input.company ?? null;
    const needsReading = !title || !company;

    const job = await this.prisma.job.create({
      data: {
        userId,
        source: JobSource.MANUAL,
        url: input.url ?? null,
        canonicalUrl: canonical,
        title,
        company,
        location: input.location ?? null,
        description,
        pageText: description,
        // What you typed is yours; the model only fills what you left blank.
        editedFields: [title && 'title', company && 'company'].filter((field): field is string => !!field),
        extraction: needsReading ? JobExtraction.PENDING : JobExtraction.MANUAL,
      },
    });

    if (needsReading) this.reader.enqueue(job.id);
    return toJobDto(job);
  }

  /** Reads the job again from what was captured, discarding your edits. */
  async reread(userId: string, id: string): Promise<JobDetailDto> {
    const job = await this.jobs.findOwned(userId, id);
    const blocks = Array.isArray(job.structuredData) ? job.structuredData : [];
    const structured = blocks.length ? jobFromJsonLd(blocks) : null;

    if (structured) {
      const updated = await this.prisma.job.update({
        where: { id },
        data: {
          ...fieldColumns(
            { ...structured, description: structured.description ?? job.pageText ?? undefined },
            new Set(),
          ),
          editedFields: [],
          extraction: JobExtraction.STRUCTURED,
          extractionError: null,
        },
      });
      return this.jobs.detail(updated);
    }

    if (!job.pageText) {
      throw new BadRequestException('There is no captured page to read again. Send it from the extension.');
    }

    const updated = await this.prisma.job.update({
      where: { id },
      data: { editedFields: [], extraction: JobExtraction.PENDING, extractionError: null },
    });
    this.reader.enqueue(id);
    return this.jobs.detail(updated);
  }

  private async isSaved(userId: string, canonical: string): Promise<boolean> {
    const count = await this.prisma.job.count({ where: { userId, canonicalUrl: canonical } });
    return count > 0;
  }
}

/**
 * What a capture knows straight away: the page's own structured data, or the
 * raw text to show while the model reads it, or nothing at all.
 */
function firstRead(jsonLd: unknown[] | undefined, pageText: string): FirstRead {
  const structured = jsonLd?.length ? jobFromJsonLd(jsonLd) : null;
  if (structured) {
    return {
      extraction: JobExtraction.STRUCTURED,
      fields: { ...structured, description: structured.description ?? (pageText || undefined) },
    };
  }
  if (pageText) return { extraction: JobExtraction.PENDING, fields: { description: pageText } };
  return { extraction: JobExtraction.FAILED, fields: {} };
}
