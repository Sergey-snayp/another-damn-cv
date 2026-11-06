import type { JobForCopy, RenderedResume, ResumeChanges } from '../../domain/resume';
import { copyChanges, isAutomaticTailoredResumeName, tailoredResumeName } from '../../domain/document';
import type { IdGenerator, ProfileDirectory, ResumeRepository } from '../ports/resume-repository';
import { ResumeError } from '../errors';
import { currentDocument } from './read-resume';
import type { SaveResume } from './save-resume';

export interface QuickTailoringDraft {
  /** Null until Save creates a document. */
  resumeId: string | null;
  sourceResumeId: string;
  name: string;
  document: RenderedResume;
  theme: unknown;
}

export interface QuickTailoringSave {
  resumeId: string | null;
  sourceResumeId: string;
  changes: ResumeChanges;
  theme: unknown;
  message?: string;
}

/** Read a saved source (or the job's existing CV) without making a copy. */
export class PreviewQuickTailoring {
  constructor(
    private readonly repository: ResumeRepository,
    private readonly profiles: ProfileDirectory,
  ) {}

  async execute(userId: string, job: JobForCopy, sourceResumeId?: string): Promise<QuickTailoringDraft> {
    const profile = await this.profiles.ensureProfile(userId);
    const copy = await this.repository.copyForJob(profile.id, job.id);
    const source = copy ?? (await this.repository.pickSource(profile.id, sourceResumeId));
    if (!source) throw new ResumeError('not-found', 'Choose one of your saved CVs.');
    const document = await currentDocument(this.repository, source.id);
    return {
      resumeId: copy?.id ?? null,
      sourceResumeId: copy?.sourceResumeId ?? source.id,
      name:
        copy && !isAutomaticTailoredResumeName(copy.name, document, job, profile)
          ? copy.name
          : tailoredResumeName(document, job, profile),
      document,
      theme: source.theme ?? null,
    };
  }
}

/** Save is the first write: a new document and its edited content commit together. */
export class SaveQuickTailoring {
  constructor(
    private readonly repository: ResumeRepository,
    private readonly profiles: ProfileDirectory,
    private readonly ids: IdGenerator,
    private readonly save: SaveResume,
  ) {}

  async execute(userId: string, job: JobForCopy, input: QuickTailoringSave): Promise<QuickTailoringDraft> {
    const profile = await this.profiles.ensureProfile(userId);
    const copy = await this.repository.copyForJob(profile.id, job.id);
    if (copy) {
      if (copy.id !== input.resumeId)
        throw new ResumeError(
          'invalid',
          'A CV for this job was saved in another window. Reopen Quick Tailor before saving.',
        );
      const previous = await currentDocument(this.repository, copy.id);
      const automaticName = isAutomaticTailoredResumeName(copy.name, previous, job, profile);
      const document = await this.save.execute({
        userId,
        id: copy.id,
        changes: input.changes,
        message: input.message,
      });
      const name = automaticName ? tailoredResumeName(document, job, profile) : copy.name;
      if (name !== copy.name) await this.repository.rename(copy.id, name);
      return {
        resumeId: copy.id,
        sourceResumeId: copy.sourceResumeId ?? copy.id,
        name,
        document,
        theme: copy.theme ?? null,
      };
    }
    if (input.resumeId) throw new ResumeError('not-found', 'This CV was deleted. Reopen Quick Tailor.');
    const source = await this.repository.pickSource(profile.id, input.sourceResumeId);
    if (!source) throw new ResumeError('not-found', 'The source CV was deleted. Choose another CV.');
    return this.repository.transaction(async (tx) => {
      const created = await tx.create({
        profileId: profile.id,
        name: tailoredResumeName({ contact: input.changes.contact }, job, profile),
        targetRole: job.title,
        jobId: job.id,
        sourceResumeId: source.id,
        theme: input.theme,
      });
      const document = await this.save.saveInTransaction(
        tx,
        created.id,
        copyChanges(input.changes, () => this.ids.next()),
        input.message,
      );
      return {
        resumeId: created.id,
        sourceResumeId: source.id,
        name: created.name,
        document,
        theme: input.theme,
      };
    });
  }
}
