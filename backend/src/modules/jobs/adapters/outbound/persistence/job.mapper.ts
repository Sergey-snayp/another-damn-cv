import type { Job as StoredJob, JobStatusEvent as StoredEvent } from '@prisma/client';
import type { Job, JobStatus, JobStatusEvent } from '../../../domain/job';

export function jobFromRow(row: StoredJob): Job {
  const { interviewDate, interviewTime, interviewTimeZone, ...fields } = row;
  return {
    ...fields,
    interview: interviewFromRow({ interviewDate, interviewTime, interviewTimeZone }),
    source: lower(row.source),
    status: lower(row.status),
    extraction: lower(row.extraction),
  };
}

export function interviewFromRow(
  row: Pick<StoredJob, 'interviewDate' | 'interviewTime' | 'interviewTimeZone'>,
) {
  return row.interviewDate && row.interviewTimeZone
    ? { date: row.interviewDate, time: row.interviewTime, timeZone: row.interviewTimeZone }
    : null;
}

export function statusEventFromRow(row: StoredEvent): JobStatusEvent {
  return { id: row.id, from: lower(row.from), to: lower(row.to), at: row.at };
}

export function statusToRow(status: JobStatus): Uppercase<JobStatus> {
  return status.toUpperCase() as Uppercase<JobStatus>;
}

function lower<T extends string>(value: T): Lowercase<T> {
  return value.toLowerCase() as Lowercase<T>;
}
