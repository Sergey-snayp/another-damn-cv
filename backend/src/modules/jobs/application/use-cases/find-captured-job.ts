import { canonicalUrl } from '../../domain/canonical-url';
import { postingKey, samePosting } from '../../domain/posting-key';
import type { JobRepository } from '../ports/job-repository';

/**
 * The saved job for a page address, if any: the extension shows "Saved" for it.
 * The same address first; else, as Simplify keeps one job across an
 * application's pages, a job saved on the same site with the same job number
 * (Avature's form ?jobId=65847 is the job page /JobDetail/…/65847).
 */
export class FindCapturedJob {
  constructor(private readonly jobs: Pick<JobRepository, 'findByCanonicalUrl' | 'findOnHost'>) {}
  async execute(userId: string, url: string) {
    const canonical = canonicalUrl(url);
    if (!canonical) return null;
    const exact = await this.jobs.findByCanonicalUrl(userId, canonical);
    if (exact) return exact;
    const key = postingKey(url);
    if (!key) return null;
    const matches = (await this.jobs.findOnHost(userId, key.host)).filter(
      (job) => samePosting(postingKey(job.url ?? ''), key) || samePosting(postingKey(job.canonicalUrl ?? ''), key),
    );
    // Only one job can be that posting; two would be a guess.
    return matches.length === 1 ? matches[0] : null;
  }
}
