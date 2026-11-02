import type { Job } from '../jobsApi';

/** Interview preparation follows the existing application; it has no copied jobs. */
export function isInterviewJob(job: Pick<Job, 'status' | 'archivedAt'>): boolean {
  return !job.archivedAt && (job.status === 'screening' || job.status === 'interview');
}
