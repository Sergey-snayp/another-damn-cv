import type { JobFields } from '../../domain/job';

export interface StructuredJobReader {
  read(blocks: unknown[]): JobFields | null;
}

export interface JobPageExtractor {
  extract(page: {
    url: string;
    pageTitle: string | null;
    text: string;
  }): Promise<{ fields: JobFields } | { failure: string }>;
}

export interface JobReadScheduler {
  enqueue(jobId: string): void;
}
