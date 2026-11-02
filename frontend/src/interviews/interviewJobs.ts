import type { InterviewSchedule, Job } from '../jobsApi';

/** Interview preparation follows the existing application; it has no copied jobs. */
export function isInterviewJob(job: Pick<Job, 'status' | 'archivedAt'>): boolean {
  return !job.archivedAt && (job.status === 'screening' || job.status === 'interview');
}

/** Resolve a saved wall time for ordering; date-only interviews stay upcoming all day. */
function scheduledTime(schedule: InterviewSchedule): number {
  const target = Date.parse(`${schedule.date}T${schedule.time ?? '23:59'}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: schedule.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const next = instant + target - wall;
    if (next === instant) break;
    instant = next;
  }
  return instant;
}

export function compareInterviewJobs(a: Pick<Job, 'interview' | 'updatedAt' | 'id'>, b: Pick<Job, 'interview' | 'updatedAt' | 'id'>, now = Date.now()): number {
  const first = a.interview ? scheduledTime(a.interview) : null;
  const second = b.interview ? scheduledTime(b.interview) : null;
  const group = (at: number | null) => at === null ? 1 : at >= now ? 0 : 2;
  return group(first) - group(second)
    || (first !== null && second !== null ? (group(first) === 2 ? second - first : first - second) : 0)
    || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}
