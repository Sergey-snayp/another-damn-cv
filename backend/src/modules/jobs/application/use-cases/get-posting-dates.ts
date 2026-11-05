import { boardPosting, postingKey, type JobBoard, type PostingDates } from '../../domain/board-posting';
import type { BoardDatesReader } from '../ports/board-dates';

const DAY = 24 * 60 * 60 * 1000;

/**
 * When a job was posted, from its job board, for the extension's job card.
 * Each posting's answer is kept for a day, so a board is asked at most once
 * a day per posting. Null for sites without a known board, or when the board
 * cannot tell (the extension then uses the page's own date).
 */
export class GetPostingDates {
  private readonly kept = new Map<string, { at: number; dates: PostingDates | null }>();

  constructor(
    private readonly boards: BoardDatesReader,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async execute(url: string): Promise<(PostingDates & { board: JobBoard }) | null> {
    const posting = boardPosting(url);
    if (!posting) return null;
    const key = postingKey(posting);
    let entry = this.kept.get(key);
    if (!entry || this.now() - entry.at > DAY) {
      const dates = await this.boards.read(posting).catch(() => null);
      entry = { at: this.now(), dates };
      this.kept.set(key, entry);
      if (this.kept.size > 2000) this.kept.delete(this.kept.keys().next().value!);
    }
    return entry.dates ? { ...entry.dates, board: posting.board } : null;
  }
}
