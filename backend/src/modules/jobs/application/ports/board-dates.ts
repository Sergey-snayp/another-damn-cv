import type { BoardPosting, PostingDates } from '../../domain/board-posting';

/** Asks a job board's public API when a posting was published. Null when the board does not know it. */
export interface BoardDatesReader {
  read(posting: BoardPosting): Promise<PostingDates | null>;
}
