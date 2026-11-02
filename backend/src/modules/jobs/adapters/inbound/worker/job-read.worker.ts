import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { JobReadScheduler } from '../../../application/ports/job-page-reader';
import type { JobReadingRepository } from '../../../application/ports/job-reading-repository';
import { JOB_REPOSITORY, JOB_READ_SCHEDULER } from '../../../jobs.tokens';

@Injectable()
export class JobReadWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobReadWorker.name);

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobs: JobReadingRepository,
    @Inject(JOB_READ_SCHEDULER) private readonly scheduler: JobReadScheduler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const pending = await this.jobs.pendingIds();
    if (pending.length) this.logger.log(`Re-reading ${pending.length} job(s) left pending`);
    for (const id of pending) this.scheduler.enqueue(id);
  }
}
