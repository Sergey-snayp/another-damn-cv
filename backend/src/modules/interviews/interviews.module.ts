import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { JOBS_API } from '../jobs/jobs.tokens';
import type { JobsApi } from '../jobs/contracts';
import { GetPreparation, SavePreparation } from './application/use-cases/manage-preparation';
import { PublicPreparationJobReader } from './adapters/outbound/modules/preparation-job.reader';
import { PrismaPreparationRepository } from './adapters/outbound/persistence/prisma-preparation.repository';
import { PreparationController } from './adapters/inbound/http/preparation.controller';
const REPOSITORY = Symbol('PREPARATION_REPOSITORY');
const JOB_READER = Symbol('PREPARATION_JOB_READER');
@Module({
  imports: [AuthModule, DatabaseModule, JobsModule],
  controllers: [PreparationController],
  providers: [
    {
      provide: JOB_READER,
      inject: [JOBS_API],
      useFactory: (jobs: JobsApi) => new PublicPreparationJobReader(jobs),
    },
    {
      provide: REPOSITORY,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new PrismaPreparationRepository(db),
    },
    {
      provide: GetPreparation,
      inject: [JOB_READER, REPOSITORY],
      useFactory: (jobs: PublicPreparationJobReader, repository: PrismaPreparationRepository) =>
        new GetPreparation(jobs, repository),
    },
    {
      provide: SavePreparation,
      inject: [JOB_READER, REPOSITORY],
      useFactory: (jobs: PublicPreparationJobReader, repository: PrismaPreparationRepository) =>
        new SavePreparation(jobs, repository),
    },
  ],
})
export class InterviewsModule {}
