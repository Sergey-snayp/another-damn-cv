import type { JobPageExtractor } from '../../../application/ports/job-page-reader';
import type { JobFields } from '../../../domain/job';
import { PAGE_READER_SYSTEM, pageReaderPrompt, parsePageReading } from './page-reader';

export interface JobPageModel {
  complete(prompt: string, system: string): Promise<string>;
}

export class ClaudeJobPageExtractor implements JobPageExtractor {
  constructor(private readonly model: JobPageModel) {}

  async extract(page: {
    url: string;
    pageTitle: string | null;
    text: string;
  }): Promise<{ fields: JobFields } | { failure: string }> {
    try {
      const answer = await this.model.complete(pageReaderPrompt(page), PAGE_READER_SYSTEM);
      const reading = parsePageReading(answer, page.text);
      if (reading.kind === 'job') return { fields: reading.fields };
      if (reading.kind === 'not-a-job') return { failure: 'This page does not look like a job posting.' };
      return { failure: 'The model answered, but not with job details.' };
    } catch (error) {
      return { failure: error instanceof Error ? error.message : 'The model could not be reached.' };
    }
  }
}
