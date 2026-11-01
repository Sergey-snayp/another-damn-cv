import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap,
} from '@nestjs/common';
import {
  Prisma, type Job, type JobStatusEvent, JobExtraction, JobSource, JobStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { canonicalUrl } from './canonical-url';
import { tidy } from './html-text';
import { jobFromJsonLd } from './structured-data';
import { PAGE_READER_SYSTEM, pageReaderPrompt, parsePageReading } from './page-reader';
import {
  CAPTURE_LIMITS, EDITABLE_FIELDS, type CaptureRequest, type EditableField, type JobFields,
} from './jobs.types';

/** What the web app and the extension see. The captured page itself stays on the server. */
export interface JobDto {
  id: string;
  source: 'extension' | 'scanner' | 'manual';
  status: StatusName;
  extraction: 'pending' | 'structured' | 'llm' | 'manual' | 'failed';
  extractionError: string | null;
  url: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  remote: boolean | null;
  employmentType: string | null;
  salary: string | null;
  postedAt: string | null;
  description: string | null;
  pageTitle: string | null;
  editedFields: string[];
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type JobSummaryDto = Omit<JobDto, 'description'> & {
  /** The copy made by "Tailor resume for this job", if there is one. */
  tailoredResumeId: string | null;
};

export interface StatusEventDto {
  id: string;
  from: StatusName;
  to: StatusName;
  at: string;
}

/** A single job, with its moves newest first: the first is the one Undo reverts. */
export type JobDetailDto = JobDto & { history: StatusEventDto[] };

type StatusName = Lowercase<JobStatus>;

const STATUSES = Object.fromEntries(
  Object.values(JobStatus).map((status) => [status.toLowerCase(), status]),
) as Record<string, JobStatus>;

const STATUS_LIST = Object.keys(STATUSES).join(', ');

/** Never sent to the browser: large, and only the server re-reads them. */
const HEAVY = { html: true, pageText: true, structuredData: true } as const;

@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);

  /**
   * Model reads run one at a time. The CLI is a whole process per call, and
   * saving five jobs quickly should not start five of them.
   */
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

  // --- capture -----------------------------------------------------------------

  async capture(userId: string, body: unknown): Promise<{ job: JobDto; created: boolean }> {
    const input = validateCapture(body);
    const canonical = canonicalUrl(input.url);
    if (!canonical) throw new BadRequestException('That page has no web address a job can be saved under.');

    const pageText = input.text ? tidy(input.text) : '';
    const structured = input.jsonLd?.length ? jobFromJsonLd(input.jsonLd) : null;

    const existing = await this.prisma.job.findUnique({
      where: { userId_canonicalUrl: { userId, canonicalUrl: canonical } },
    });
    const edited = new Set(existing?.editedFields ?? []);

    const read = structured
      ? { extraction: JobExtraction.STRUCTURED, fields: { ...structured, description: structured.description ?? (pageText || undefined) } }
      : pageText
        // Shown while the model reads; replaced by the cut-out description after.
        ? { extraction: JobExtraction.PENDING, fields: { description: pageText } as JobFields }
        : { extraction: JobExtraction.FAILED, fields: {} as JobFields };

    const data = {
      url: input.url,
      pageTitle: input.pageTitle?.slice(0, 500) ?? null,
      html: input.html ?? null,
      pageText: pageText || null,
      structuredData: input.jsonLd?.length ? (input.jsonLd as Prisma.InputJsonValue) : Prisma.DbNull,
      extraction: read.extraction,
      extractionError: read.extraction === JobExtraction.FAILED ? 'Nothing readable was captured from that page.' : null,
      capturedAt: new Date(),
      // Re-sending a job the model already read keeps its fields until the new
      // read lands, rather than blanking them for the minute it takes.
      ...(existing && read.extraction === JobExtraction.PENDING ? {} : fieldsData(read.fields, edited)),
    };

    const job = existing
      ? await this.prisma.job.update({ where: { id: existing.id }, data })
      : await this.prisma.job.create({
          data: { ...data, userId, source: JobSource.EXTENSION, canonicalUrl: canonical, editedFields: [] },
        });

    if (job.extraction === JobExtraction.PENDING) this.enqueue(job.id);
    return { job: toDto(job), created: !existing };
  }

  /** A pasted posting. Title and company are read by the model when left out. */
  async createManual(userId: string, body: unknown): Promise<JobDto> {
    const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    const description = typeof input.description === 'string' ? tidy(input.description) : '';
    if (!description) throw new BadRequestException('Paste the job description.');
    if (description.length > CAPTURE_LIMITS.text) throw new BadRequestException('That description is too long.');

    const url = optionalString(input.url, 'url');
    const canonical = url ? canonicalUrl(url) : null;
    if (url && !canonical) throw new BadRequestException('That link is not a valid web address.');

    if (canonical) {
      const existing = await this.prisma.job.findUnique({
        where: { userId_canonicalUrl: { userId, canonicalUrl: canonical } },
      });
      if (existing) throw new BadRequestException('That job is already saved.');
    }

    const title = optionalString(input.title, 'title');
    const company = optionalString(input.company, 'company');
    const needsReading = !title || !company;

    const job = await this.prisma.job.create({
      data: {
        userId,
        source: JobSource.MANUAL,
        url,
        canonicalUrl: canonical,
        title,
        company,
        location: optionalString(input.location, 'location'),
        description,
        pageText: description,
        // What you typed is yours; the model only fills what you left blank.
        editedFields: [title && 'title', company && 'company'].filter((f): f is string => Boolean(f)),
        extraction: needsReading ? JobExtraction.PENDING : JobExtraction.MANUAL,
      },
    });

    if (needsReading) this.enqueue(job.id);
    return toDto(job);
  }

  // --- reading -----------------------------------------------------------------

  /** Reads again from what was captured, discarding edits. */
  async reread(userId: string, id: string): Promise<JobDetailDto> {
    const job = await this.owned(userId, id);
    const blocks = Array.isArray(job.structuredData) ? job.structuredData : [];
    const structured = blocks.length ? jobFromJsonLd(blocks) : null;

    if (structured) {
      const updated = await this.prisma.job.update({
        where: { id },
        data: {
          ...fieldsData({ ...structured, description: structured.description ?? job.pageText ?? undefined }, new Set()),
          editedFields: [],
          extraction: JobExtraction.STRUCTURED,
          extractionError: null,
        },
      });
      return this.detail(updated);
    }

    if (!job.pageText) throw new BadRequestException('There is no captured page to read again. Send it from the extension.');

    const updated = await this.prisma.job.update({
      where: { id },
      data: { editedFields: [], extraction: JobExtraction.PENDING, extractionError: null },
    });
    this.enqueue(id);
    return this.detail(updated);
  }

  private enqueue(id: string): void {
    this.queue = this.queue
      .then(() => this.readWithModel(id))
      .catch((err: unknown) => this.logger.error(`Reading job ${id} failed`, err as Error));
  }

  private async readWithModel(id: string): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    // Deleted, or read some other way while it waited.
    if (!job || job.extraction !== JobExtraction.PENDING || !job.pageText) return;

    const pageText = job.pageText;
    let failure: string | null = null;
    let fields: JobFields | null = null;

    try {
      const answer = await this.llm.complete(
        pageReaderPrompt({ url: job.url ?? '', pageTitle: job.pageTitle, text: pageText }),
        PAGE_READER_SYSTEM,
      );
      const reading = parsePageReading(answer, pageText);

      if (reading.kind === 'job') fields = reading.fields;
      else if (reading.kind === 'not-a-job') failure = 'This page does not look like a job posting.';
      else failure = 'The model answered, but not with job details.';
    } catch (err) {
      failure = err instanceof Error ? err.message : 'The model could not be reached.';
    }

    // Edits made while it was reading win over what the model found.
    const current = await this.prisma.job.findUnique({ where: { id }, select: { editedFields: true, extraction: true } });
    if (!current || current.extraction !== JobExtraction.PENDING) return;

    await this.prisma.job.update({
      where: { id },
      data: fields
        ? { ...fieldsData(fields, new Set(current.editedFields)), extraction: JobExtraction.LLM, extractionError: null }
        : { extraction: JobExtraction.FAILED, extractionError: failure },
    });
  }

  // --- the web app -------------------------------------------------------------

  async list(userId: string, status?: string): Promise<JobSummaryDto[]> {
    const where: Prisma.JobWhereInput = { userId };
    if (status) {
      const value = STATUSES[status];
      if (!value) throw new BadRequestException(`Unknown status "${status}".`);
      where.status = value;
    }

    const jobs = await this.prisma.job.findMany({
      where,
      omit: { ...HEAVY, description: true },
      include: { resumes: { select: { id: true }, orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
    });
    return jobs.map(({ resumes, ...job }) => {
      const { description: _ignored, ...summary } = toDto({ ...job, description: null });
      return { ...summary, tailoredResumeId: resumes[0]?.id ?? null };
    });
  }

  async get(userId: string, id: string): Promise<JobDetailDto> {
    return this.detail(await this.owned(userId, id));
  }

  /**
   * Edits fields and/or moves the job.
   *
   * A move writes its event in the same transaction as the status, so the
   * history can never disagree with the board. Saving the status a job already
   * has records nothing.
   */
  async update(userId: string, id: string, body: unknown): Promise<JobDetailDto> {
    const job = await this.owned(userId, id);
    const patch = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

    const data: Prisma.JobUpdateInput = {};
    const edited = new Set(job.editedFields);

    for (const key of EDITABLE_FIELDS) {
      if (!(key in patch)) continue;
      const value = patch[key];

      if (key === 'remote') {
        if (value !== null && typeof value !== 'boolean') throw new BadRequestException('remote must be true, false or null.');
        data.remote = value;
      } else {
        data[key] = optionalString(value, key);
      }
      edited.add(key);
    }

    let move: JobStatus | null = null;
    if ('status' in patch) {
      const status = typeof patch.status === 'string' ? STATUSES[patch.status] : undefined;
      if (!status) throw new BadRequestException(`status must be one of: ${STATUS_LIST}.`);
      data.status = status;
      if (status !== job.status) move = status;
    }

    data.editedFields = [...edited];
    const updated = await this.prisma.$transaction(async (tx) => {
      if (move) await tx.jobStatusEvent.create({ data: { jobId: id, from: job.status, to: move } });
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
  async undoStatus(userId: string, id: string, eventId: unknown): Promise<JobDetailDto> {
    await this.owned(userId, id);
    if (typeof eventId !== 'string' || !eventId) throw new BadRequestException('Say which move to undo.');

    const updated = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.jobStatusEvent.findFirst({ where: { jobId: id }, orderBy: [{ at: 'desc' }, { id: 'desc' }] });
      if (!latest || latest.id !== eventId) {
        throw new ConflictException('This job has moved since. Change its status instead.');
      }
      await tx.jobStatusEvent.delete({ where: { id: latest.id } });
      return tx.job.update({ where: { id }, data: { status: latest.from } });
    });
    return this.detail(updated);
  }

  private async detail(job: Job): Promise<JobDetailDto> {
    const events = await this.prisma.jobStatusEvent.findMany({
      where: { jobId: job.id }, orderBy: [{ at: 'desc' }, { id: 'desc' }],
    });
    return { ...toDto(job), history: events.map(eventDto) };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.job.delete({ where: { id } });
  }

  /** 404 for someone else's job too: whether an id exists is not theirs to learn. */
  private async owned(userId: string, id: string): Promise<Job> {
    const job = await this.prisma.job.findFirst({ where: { id, userId } });
    if (!job) throw new NotFoundException('Job not found.');
    return job;
  }
}

// --- helpers -------------------------------------------------------------------

function validateCapture(body: unknown): CaptureRequest {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('Expected a captured page.');
  const input = body as Record<string, unknown>;

  if (typeof input.url !== 'string' || !input.url) throw new BadRequestException('The page address is missing.');

  const html = typeof input.html === 'string' ? input.html : undefined;
  const text = typeof input.text === 'string' ? input.text : undefined;
  const jsonLd = Array.isArray(input.jsonLd) ? input.jsonLd : undefined;

  if (html && html.length > CAPTURE_LIMITS.html) throw new BadRequestException('That page is too large to save.');
  if (text && text.length > CAPTURE_LIMITS.text) throw new BadRequestException('That page has too much text to save.');
  if (jsonLd && JSON.stringify(jsonLd).length > CAPTURE_LIMITS.jsonLd) {
    throw new BadRequestException('That page carries too much structured data to save.');
  }

  return {
    url: input.url,
    pageTitle: typeof input.pageTitle === 'string' ? input.pageTitle : undefined,
    html,
    text,
    jsonLd,
  };
}

function optionalString(value: unknown, name: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException(`${name} must be text.`);
  return value.trim() || null;
}

/** The read fields as columns, leaving alone the ones the person edited. */
type FieldColumns = {
  [K in EditableField]?: K extends 'remote' ? boolean | null : string | null;
} & { postedAt?: Date | null };

function fieldsData(fields: JobFields, edited: Set<string>): FieldColumns {
  const data: Record<string, string | boolean | Date | null> = {};

  for (const key of EDITABLE_FIELDS) {
    if (edited.has(key)) continue;
    data[key] = fields[key] ?? null;
  }
  data.postedAt = fields.postedAt ? new Date(fields.postedAt) : null;

  return data as FieldColumns;
}

function eventDto(event: JobStatusEvent): StatusEventDto {
  return {
    id: event.id,
    from: event.from.toLowerCase() as StatusName,
    to: event.to.toLowerCase() as StatusName,
    at: event.at.toISOString(),
  };
}

function toDto(job: Omit<Job, keyof typeof HEAVY>): JobDto {
  return {
    id: job.id,
    source: job.source.toLowerCase() as JobDto['source'],
    status: job.status.toLowerCase() as StatusName,
    extraction: job.extraction.toLowerCase() as JobDto['extraction'],
    extractionError: job.extractionError,
    url: job.url,
    title: job.title,
    company: job.company,
    location: job.location,
    remote: job.remote,
    employmentType: job.employmentType,
    salary: job.salary,
    postedAt: job.postedAt?.toISOString() ?? null,
    description: job.description,
    pageTitle: job.pageTitle,
    editedFields: job.editedFields,
    capturedAt: job.capturedAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
