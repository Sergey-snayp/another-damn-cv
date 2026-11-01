import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { JobExtraction } from '@prisma/client';
import { LlmService } from '../llm/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { fieldColumns } from './job-fields';
import { PAGE_READER_SYSTEM, pageReaderPrompt, parsePageReading } from './page-reader';
import type { JobFields } from './jobs.types';

/**
 * Reads captured pages with the model, in the background.
 *
 * Reads run one at a time: the CLI is a whole process per call, and saving
 * five jobs quickly should not start five of them.
 */
@Injectable()
export class JobReaderService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobReaderService.name);
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  /** A restart drops the in-memory queue; anything still pending is picked up again. */
  async onApplicationBootstrap(): Promise<void> {
    const pending = await this.prisma.job.findMany({
      where: { extraction: JobExtraction.PENDING },
      select: { id: true },
      orderBy: { capturedAt: 'asc' },
    });
    if (pending.length > 0) this.logger.log(`Re-reading ${pending.length} job(s) left pending`);
    for (const { id } of pending) this.enqueue(id);
  }

  /** Queues a read. The job must already be PENDING with page text. */
  enqueue(jobId: string): void {
    this.queue = this.queue
      .then(() => this.read(jobId))
      .catch((err: unknown) => this.logger.error(`Reading job ${jobId} failed`, err));
  }

  private async read(jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    // Deleted, or read some other way while it waited.
    if (job?.extraction !== JobExtraction.PENDING || !job.pageText) return;

    const outcome = await this.askModel(job.url ?? '', job.pageTitle, job.pageText);

    // Edits made while it was reading win over what the model found.
    const current = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { editedFields: true, extraction: true },
    });
    if (current?.extraction !== JobExtraction.PENDING) return;

    await this.prisma.job.update({
      where: { id: jobId },
      data:
        'fields' in outcome
          ? {
              ...fieldColumns(outcome.fields, new Set(current.editedFields)),
              extraction: JobExtraction.LLM,
              extractionError: null,
            }
          : { extraction: JobExtraction.FAILED, extractionError: outcome.failure },
    });
  }

  private async askModel(
    url: string,
    pageTitle: string | null,
    text: string,
  ): Promise<{ fields: JobFields } | { failure: string }> {
    try {
      const answer = await this.llm.complete(pageReaderPrompt({ url, pageTitle, text }), PAGE_READER_SYSTEM);
      const reading = parsePageReading(answer, text);
      if (reading.kind === 'job') return { fields: reading.fields };
      if (reading.kind === 'not-a-job') return { failure: 'This page does not look like a job posting.' };
      return { failure: 'The model answered, but not with job details.' };
    } catch (err) {
      return { failure: err instanceof Error ? err.message : 'The model could not be reached.' };
    }
  }
}
