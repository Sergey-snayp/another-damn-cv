import {
  EDITABLE_FIELDS,
  salaryText,
  type JobDetail,
  type JobStatus,
  type SalaryPeriod,
} from '../../domain/job';
import { canonicalUrl } from '../../domain/canonical-url';
import { JobInputError, JobNotFoundError } from '../errors';
import { interviewScheduleProblem, type InterviewSchedule } from '../../domain/interview-schedule';
import type { JobChanges, JobRepository } from '../ports/job-repository';

export interface JobEdit {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  employmentType?: string | null;
  salary?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  url?: string | null;
  description?: string | null;
  /** Your own notes on the job; page reads never write them. */
  notes?: string | null;
  remote?: boolean | null;
  status?: JobStatus;
  interview?: InterviewSchedule | null;
}

export class UpdateJob {
  constructor(private readonly jobs: Pick<JobRepository, 'findOwned' | 'update' | 'history'>) {}

  async execute(userId: string, id: string, edit: JobEdit): Promise<JobDetail> {
    const existing = await this.jobs.findOwned(userId, id);
    if (!existing) throw new JobNotFoundError();
    if (edit.interview) {
      const problem = interviewScheduleProblem(edit.interview);
      if (problem) throw new JobInputError(problem);
    }
    const { status, ...fields } = edit;
    if (fields.url && !canonicalUrl(fields.url))
      throw new JobInputError('That link is not a valid web address.');
    if (
      (['salaryMin', 'salaryMax', 'salaryCurrency', 'salaryPeriod'] as const).some(
        (key) => fields[key] !== undefined,
      )
    ) {
      let min = fields.salaryMin === undefined ? existing.salaryMin : fields.salaryMin;
      let max = fields.salaryMax === undefined ? existing.salaryMax : fields.salaryMax;
      if (min !== null && max !== null && min > max) [min, max] = [max, min];
      const currency =
        (fields.salaryCurrency === undefined ? existing.salaryCurrency : fields.salaryCurrency)
          ?.trim()
          .toUpperCase() || null;
      const period = fields.salaryPeriod === undefined ? existing.salaryPeriod : fields.salaryPeriod;
      Object.assign(fields, {
        salaryMin: min,
        salaryMax: max,
        salaryCurrency: min === null && max === null ? null : currency,
        salaryPeriod: min === null && max === null ? null : period,
        salary: salaryText(min, max, currency, period),
      });
    }
    const editedNow = EDITABLE_FIELDS.filter((key) => fields[key] !== undefined);
    const changes: JobChanges = {
      ...fields,
      editedFields: [...new Set([...existing.editedFields, ...editedNow])],
      ...(status && { status }),
    };
    const moved = status !== undefined && status !== existing.status;
    const job = await this.jobs.update(
      userId,
      id,
      changes,
      moved ? { from: existing.status, to: status } : undefined,
    );
    return { job, history: await this.jobs.history(userId, id) };
  }
}
