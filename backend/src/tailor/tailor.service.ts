import { Injectable } from '@nestjs/common';
import type { Coverage, JobPosting, TailorRequest, TailorResult } from '../shared';
import { FactBaseService } from '../factbase/factbase.service';

/**
 * Selection, not generation.
 *
 * TODO — port the proven logic from CVs/cv-tailor.mjs rather than rewriting it:
 *   analyse()        split posting concepts into evidenced / self-reported / missing
 *   rank()           score projects and achievements against the posting
 *   unique-coverage  a project that is the only evidence for a required concept
 *                    displaces the weakest survivor when trimming
 *   boldTech()       bold real tooling inside bullets, leave concepts alone
 *   renderAnchors()  interview brief instead of a CV
 */
@Injectable()
export class TailorService {
  constructor(private readonly factBase: FactBaseService) {}

  /**
   * Placeholder coverage: every concept lands in `missing` until analyse() is
   * ported. Deliberately pessimistic — a stub that over-reports coverage would
   * put unsupported claims on a real application.
   */
  analyse(posting: JobPosting): Coverage {
    const concepts = this.extractConcepts(posting.description);

    return {
      evidenced: [],
      selfReported: [],
      missing: concepts.map((concept) => ({ concept, importance: 1 })),
    };
  }

  tailor(request: TailorRequest): TailorResult {
    const coverage = this.analyse(request.posting);

    return {
      markdown: `# ${request.posting.title}\n\n_Not implemented: port cv-tailor.mjs selection._\n`,
      coverage,
      used: [],
    };
  }

  /** Crude for now; skills-taxonomy.json replaces this. */
  private extractConcepts(description: string): string[] {
    const words = description.toLowerCase().match(/[a-z][a-z0-9+.#/-]{2,}/g) ?? [];
    return [...new Set(words)].slice(0, 40);
  }
}
