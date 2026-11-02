import { EDITABLE_FIELDS, type JobDetail, type JobStatus } from '../../domain/job';
import { JobNotFoundError } from '../errors';
import type { JobChanges, JobRepository } from '../ports/job-repository';

export interface JobEdit {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  employmentType?: string | null;
  salary?: string | null;
  description?: string | null;
  remote?: boolean | null;
  status?: JobStatus;
}

export class UpdateJob {
  constructor(private readonly jobs: Pick<JobRepository, 'findOwned' | 'update' | 'history'>) {}

  async execute(userId: string, id: string, edit: JobEdit): Promise<JobDetail> {
    const existing = await this.jobs.findOwned(userId, id);
    if (!existing) throw new JobNotFoundError();
    const { status, ...fields } = edit;
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
