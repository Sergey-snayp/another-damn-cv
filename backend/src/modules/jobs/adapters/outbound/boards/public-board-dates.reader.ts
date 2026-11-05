import type { BoardDatesReader } from '../../../application/ports/board-dates';
import type { BoardPosting, PostingDates } from '../../../domain/board-posting';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const iso = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value)))
    return value;
  return null;
};

/**
 * The job boards' free public APIs, as Simplify's server uses them:
 *   Greenhouse       first_published, updated_at
 *   Lever            createdAt (milliseconds)
 *   Ashby            publishedAt (from the company's job board list)
 *   SmartRecruiters  releasedDate
 */
export class PublicBoardDatesReader implements BoardDatesReader {
  constructor(private readonly fetcher: Fetch = (url, init) => fetch(url, init)) {}

  async read(posting: BoardPosting): Promise<PostingDates | null> {
    const account = encodeURIComponent(posting.account);
    const id = encodeURIComponent(posting.id);
    switch (posting.board) {
      case 'greenhouse': {
        const job = await this.json(
          `https://boards-api${posting.eu ? '.eu' : ''}.greenhouse.io/v1/boards/${account}/jobs/${id}`,
        );
        return this.dates(job?.first_published, job?.updated_at);
      }
      case 'lever': {
        const job = await this.json(
          `https://api${posting.eu ? '.eu' : ''}.lever.co/v0/postings/${account}/${id}`,
        );
        return this.dates(job?.createdAt, job?.updatedAt);
      }
      case 'ashby': {
        const board = await this.json(`https://api.ashbyhq.com/posting-api/job-board/${account}`);
        const jobs = Array.isArray(board?.jobs) ? (board.jobs as Record<string, unknown>[]) : [];
        const job = jobs.find((item) => item.id === posting.id);
        return this.dates(job?.publishedAt, job?.updatedAt);
      }
      case 'smartrecruiters': {
        const job = await this.json(`https://api.smartrecruiters.com/v1/companies/${account}/postings/${id}`);
        return this.dates(job?.releasedDate, null);
      }
    }
  }

  private dates(posted: unknown, updated: unknown): PostingDates | null {
    const result = { posted: iso(posted), updated: iso(updated) };
    return result.posted || result.updated ? result : null;
  }

  private async json(url: string): Promise<Record<string, unknown> | null> {
    const response = await this.fetcher(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  }
}
