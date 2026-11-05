import { canonicalUrl } from '../../domain/canonical-url';
import { APPLIED_STATUSES, cleanAnswers, type ApplicationAnswer, type JobStatus } from '../../domain/job';
import { JobInputError, JobNotFoundError } from '../errors';
import type { JobChanges, JobRepository } from '../ports/job-repository';
import type {
  ApplicationDraft,
  ApplicationPreferences,
  ApplicationRepository,
  ApplicationResumeReader,
} from '../ports/application-repository';

export interface ApplicationInput {
  title: string;
  company: string;
  location?: string | null;
  employmentType?: string | null;
  status?: JobStatus;
  resumeId?: string;
  resumeSnapshot?: number;
  url?: string | null;
  salary?: string | null;
  description?: string | null;
  addedAt?: Date;
  appliedAt?: Date;
  favorite?: boolean;
  archived?: boolean;
}

async function prepare(
  userId: string,
  input: ApplicationInput,
  resumes: ApplicationResumeReader,
  at: Date,
): Promise<ApplicationDraft> {
  const title = input.title.trim(),
    company = input.company.trim();
  if (!title || !company) throw new JobInputError('Position title and company are required.');
  const url = input.url?.trim() || null;
  const canonical = url ? canonicalUrl(url) : null;
  if (url && !canonical) throw new JobInputError('That link is not a valid web address.');
  const snapshot = input.resumeId
    ? await resumes.savedSnapshot(userId, input.resumeId, input.resumeSnapshot)
    : null;
  if (input.resumeId && !snapshot) throw new JobInputError('Choose one of your saved resumes.');
  const status = input.status ?? 'applied';
  const appliedAt = APPLIED_STATUSES.includes(status) ? (input.appliedAt ?? at) : null;
  const editedFields = ['title', 'company', 'location', 'employmentType', 'salary', 'description'];
  return {
    job: {
      userId,
      source: 'manual',
      extraction: 'manual',
      title,
      company,
      url,
      canonicalUrl: canonical,
      location: input.location?.trim() || null,
      employmentType: input.employmentType?.trim() || null,
      salary: input.salary?.trim() || null,
      description: input.description?.trim() || null,
      status,
      capturedAt: input.addedAt ?? at,
      appliedAt,
      isFavorite: input.favorite ?? false,
      archivedAt: input.archived ? at : null,
      applicationResumeId: input.resumeId ?? null,
      applicationSnapshot: snapshot,
      editedFields,
    },
    statusAt: appliedAt ?? input.addedAt ?? at,
  };
}

export class AddApplication {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly resumes: ApplicationResumeReader,
    private readonly now = () => new Date(),
  ) {}
  async execute(userId: string, input: ApplicationInput) {
    return this.repository.createApplication(await prepare(userId, input, this.resumes, this.now()));
  }
}

export class ExportApplications {
  constructor(private readonly repository: ApplicationRepository) {}
  execute(userId: string) {
    return this.repository.exportApplications(userId);
  }
}

export class SetApplicationResume {
  constructor(
    private readonly jobs: Pick<JobRepository, 'findOwned' | 'update'>,
    private readonly resumes: ApplicationResumeReader,
  ) {}
  async execute(userId: string, id: string, resumeId: string | null) {
    if (!(await this.jobs.findOwned(userId, id))) throw new JobNotFoundError();
    const snapshot = resumeId ? await this.resumes.savedSnapshot(userId, resumeId) : null;
    if (resumeId && !snapshot) throw new JobInputError('Choose one of your saved resumes.');
    return this.jobs.update(userId, id, { applicationResumeId: resumeId, applicationSnapshot: snapshot });
  }
}

/**
 * What the extension used on a saved job's form: the CV it uploaded and the
 * answers to the company's questions. Recorded when the job is saved after
 * Autofill, or when Autofill runs on a job saved before. Never saves a job.
 */
export class RecordApplication {
  constructor(
    private readonly jobs: Pick<JobRepository, 'findOwned' | 'update'>,
    private readonly resumes: ApplicationResumeReader,
  ) {}
  async execute(userId: string, id: string, input: { resumeId?: string; answers?: ApplicationAnswer[] }) {
    if (!(await this.jobs.findOwned(userId, id))) throw new JobNotFoundError();
    const changes: JobChanges = {};
    if (input.resumeId) {
      const snapshot = await this.resumes.savedSnapshot(userId, input.resumeId);
      if (!snapshot) throw new JobInputError('Choose one of your saved resumes.');
      Object.assign(changes, { applicationResumeId: input.resumeId, applicationSnapshot: snapshot });
    }
    const answers = input.answers ? cleanAnswers(input.answers) : [];
    if (answers.length) changes.applicationAnswers = answers;
    return Object.keys(changes).length
      ? this.jobs.update(userId, id, changes)
      : (await this.jobs.findOwned(userId, id))!;
  }
}

export class ImportApplications {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly resumes: ApplicationResumeReader,
    private readonly now = () => new Date(),
  ) {}
  async execute(userId: string, rows: ApplicationInput[]) {
    if (!rows.length || rows.length > 500)
      throw new JobInputError('Import between 1 and 500 applications at a time.');
    const drafts: ApplicationDraft[] = [];
    for (const row of rows)
      drafts.push(await prepare(userId, { ...row, status: row.status ?? 'saved' }, this.resumes, this.now()));
    return this.repository.importApplications(userId, drafts);
  }
}

export class UpdateApplicationPreferences {
  constructor(
    private readonly repository: ApplicationRepository,
    private readonly now = () => new Date(),
  ) {}
  async execute(userId: string, ids: readonly string[], preferences: ApplicationPreferences) {
    if (!ids.length || ids.length > 1000) throw new JobInputError('Choose between 1 and 1,000 applications.');
    if (preferences.favorite === undefined && preferences.archived === undefined)
      throw new JobInputError('Choose a favorite or archive change.');
    return this.repository.updatePreferences(userId, [...new Set(ids)], preferences, this.now());
  }
}
