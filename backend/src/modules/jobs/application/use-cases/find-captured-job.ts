import { canonicalUrl } from '../../domain/canonical-url';
import type { JobRepository } from '../ports/job-repository';

/** The saved job for a page address, if any: the extension shows "Saved" for it. */
export class FindCapturedJob {
  constructor(private readonly jobs: Pick<JobRepository, 'findByCanonicalUrl'>) {}
  async execute(userId: string, url: string) {
    const canonical = canonicalUrl(url);
    return canonical ? this.jobs.findByCanonicalUrl(userId, canonical) : null;
  }
}
