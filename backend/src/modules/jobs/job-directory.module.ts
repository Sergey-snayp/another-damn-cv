import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { PrismaJobRepository } from './adapters/outbound/persistence/prisma-job.repository';
import { GetJobForTailoring } from './application/use-cases/get-job-for-tailoring';
import { GetJobForPreparation } from './application/use-cases/get-job-for-preparation';
import type { JobRepository } from './application/ports/job-repository';
import type { JobsApi } from './contracts';
import { JOB_REPOSITORY, JOBS_API } from './jobs.tokens';

/** Job data wiring without controllers, workers, AI, or a dependency on resumes. */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: JOB_REPOSITORY,
      inject: [PrismaService],
      useFactory: (database: PrismaService) => new PrismaJobRepository(database),
    },
    {
      provide: JOBS_API,
      inject: [JOB_REPOSITORY],
      useFactory: (repository: JobRepository): JobsApi => {
        const get = new GetJobForTailoring(repository);
        const preparation = new GetJobForPreparation(repository);
        return {
          getForTailoring: (userId, id) => get.execute(userId, id),
          getForPreparation: (userId, id) => preparation.execute(userId, id),
        };
      },
    },
  ],
  exports: [JOB_REPOSITORY, JOBS_API],
})
export class JobDirectoryModule {}
