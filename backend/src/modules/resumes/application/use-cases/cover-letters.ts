import type { ResumesApi } from '../../contracts';
import { ResumeError } from '../errors';
import type { TailoringJobReader } from '../ports/tailoring';
import {
  LETTER_WORD_LIMIT,
  coverLetterFileName,
  coverLetterHtml,
  tidyLetter,
  type LetterAuthor,
} from '../../domain/cover-letter';
import { checkNoCodebaseCounts, checkNumbersInRecord, experienceRecord } from '../../domain/summary-checks';

export interface StoredCoverLetter {
  jobId: string;
  resumeId: string | null;
  text: string;
  fileName: string;
  updatedAt: Date;
}

/** One letter per person and job. */
export interface CoverLetterStore {
  find(userId: string, jobId: string): Promise<StoredCoverLetter | null>;
  save(
    userId: string,
    jobId: string,
    letter: { resumeId: string | null; text: string; fileName: string },
  ): Promise<StoredCoverLetter>;
}

/** Writes the letter from the posting and the experience record. */
export interface CoverLetterWriter {
  write(input: {
    job: string;
    experience: string;
    candidate: string;
    request?: string;
  }): Promise<{ letter: string; cannotClaim: string[] }>;
}

/** Prints an HTML page to PDF. */
export interface HtmlPdfRenderer {
  renderHtml(html: string): Promise<Buffer>;
}

export interface CoverLetterView extends StoredCoverLetter {
  /** What the posting asks for that the CV cannot support, so the letter does not claim it. */
  cannotClaim?: string[];
  /** Things to check before sending: numbers the CV does not state. */
  warnings?: string[];
}

const MAX_LETTER = 10_000;

/**
 * Cover letters for saved jobs. As with CVs, the letter lives on the server;
 * the extension downloads its PDF when it attaches it to an application.
 */
export class CoverLetters {
  constructor(
    private readonly resumes: Pick<ResumesApi, 'current'>,
    private readonly jobs: TailoringJobReader,
    private readonly store: CoverLetterStore,
    private readonly writer: CoverLetterWriter,
    private readonly pdf: HtmlPdfRenderer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The job's letter, or null. The job must be the person's. */
  async get(userId: string, jobId: string): Promise<StoredCoverLetter | null> {
    await this.jobs.getForTailoring(userId, jobId);
    return this.store.find(userId, jobId);
  }

  /** Writes (or rewrites) the job's letter from one of the person's CVs. */
  async generate(
    userId: string,
    jobId: string,
    input: { resumeId: string; instruction?: string },
  ): Promise<CoverLetterView> {
    const job = await this.jobs.getForTailoring(userId, jobId);
    if (!job.description?.trim())
      throw new ResumeError(
        'invalid',
        job.extraction === 'PENDING'
          ? 'The job is still being read. Try again in a few seconds.'
          : 'This job has no description yet. Add one in the tracker.',
      );
    const resume = await this.resumes.current(userId, input.resumeId);
    const record = experienceRecord(resume, this.now());
    const author = authorOf(resume.contact);
    const title = job.title ?? job.pageTitle ?? '';
    const written = await this.writer.write({
      job: [
        title && `Job title: ${title}`,
        job.company && `Company: ${job.company}`,
        job.description.slice(0, 20_000),
      ]
        .filter(Boolean)
        .join('\n'),
      experience: record.text,
      candidate: [
        `Name: ${[author?.firstName, author?.lastName].filter(Boolean).join(' ') || 'the candidate'}`,
        resume.contact?.location && `Based in: ${resume.contact.location}`,
        resume.contact?.openToRelocation && 'Open to relocation: yes',
      ]
        .filter(Boolean)
        .join('\n'),
      request: input.instruction,
    });
    const text = tidyLetter(written.letter).slice(0, MAX_LETTER);
    if (!text) throw new ResumeError('invalid', 'The AI returned an empty letter. Try again.');
    const numbers = checkNumbersInRecord(text, record);
    const words = text.split(/\s+/).filter(Boolean).length;
    const counts = checkNoCodebaseCounts(text);
    const saved = await this.store.save(userId, jobId, {
      resumeId: input.resumeId,
      text,
      fileName: coverLetterFileName(author, job.company),
    });
    return {
      ...saved,
      cannotClaim: written.cannotClaim.slice(0, 8),
      warnings: [
        ...(numbers.ok ? [] : [`Check these numbers: ${numbers.detail ?? ''}`]),
        ...(counts.ok ? [] : [`Consider cutting codebase counts. ${counts.detail ?? ''}`]),
        ...(words > LETTER_WORD_LIMIT
          ? [`${words} words: it may run onto a second page. Ask for a shorter one or trim it.`]
          : []),
      ],
    };
  }

  /** The person's own edit. */
  async update(userId: string, jobId: string, text: string): Promise<StoredCoverLetter> {
    const letter = await this.get(userId, jobId);
    if (!letter) throw new ResumeError('not-found', 'There is no cover letter for this job yet.');
    const clean = text.trim();
    if (!clean) throw new ResumeError('invalid', 'The letter is empty.');
    return this.store.save(userId, jobId, { ...letter, text: clean.slice(0, MAX_LETTER) });
  }

  /** The letter as a PDF, with its file name. */
  async pdfOf(userId: string, jobId: string): Promise<{ pdf: Buffer; fileName: string }> {
    const letter = await this.get(userId, jobId);
    if (!letter) throw new ResumeError('not-found', 'There is no cover letter for this job yet.');
    const resume = letter.resumeId
      ? await this.resumes.current(userId, letter.resumeId).catch(() => null)
      : null;
    const html = coverLetterHtml(letter.text, authorOf(resume?.contact ?? null));
    return { pdf: await this.pdf.renderHtml(html), fileName: letter.fileName };
  }
}

function authorOf(contact: LetterAuthor | null | undefined): LetterAuthor | null {
  if (!contact) return null;
  return {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    location: contact.location,
    linkedin: contact.linkedin,
  };
}
