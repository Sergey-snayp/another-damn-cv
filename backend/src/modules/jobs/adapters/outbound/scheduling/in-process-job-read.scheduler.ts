import type { JobReadScheduler } from '../../../application/ports/job-page-reader';
import type { ReadJobPage } from '../../../application/use-cases/read-job-page';

export interface JobReadingLogger {
  error(message: string, error: unknown): void;
}

/** One queue per registered module, matching the existing one-process reader. */
export class InProcessJobReadScheduler implements JobReadScheduler {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly read: Pick<ReadJobPage, 'execute'>,
    private readonly logger: JobReadingLogger,
  ) {}

  enqueue(jobId: string): void {
    this.queue = this.queue
      .then(() => this.read.execute(jobId))
      .catch((error: unknown) => this.logger.error(`Reading job ${jobId} failed`, error));
  }

  /** Lets shutdown/testing wait for existing work without starting another worker. */
  idle(): Promise<void> {
    return this.queue;
  }
}
