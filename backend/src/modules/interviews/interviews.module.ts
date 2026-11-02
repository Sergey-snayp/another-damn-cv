import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { JobDirectoryModule } from '../jobs/job-directory.module';
import { ResumesModule } from '../resumes/resumes.module';
import { RESUMES_API } from '../resumes/resumes.tokens';
import type { ResumesApi } from '../resumes/contracts';
import { AiModule } from '../../shared/ai/ai.module';
import { ClaudeProcessRunner } from '../../shared/ai/claude-process.runner';
import { JOBS_API } from '../jobs/jobs.tokens';
import type { JobsApi } from '../jobs/contracts';
import { GetPreparation, SavePreparation } from './application/use-cases/manage-preparation';
import { PublicPreparationJobReader } from './adapters/outbound/modules/preparation-job.reader';
import { PrismaPreparationRepository } from './adapters/outbound/persistence/prisma-preparation.repository';
import { PreparationController } from './adapters/inbound/http/preparation.controller';
import { PracticeController } from './adapters/inbound/http/practice.controller';
import { PublicPracticeContextReader } from './adapters/outbound/modules/practice-context.reader';
import { PrismaPracticeRepository } from './adapters/outbound/persistence/prisma-practice.repository';
import { ClaudeCliPracticeGenerator } from './adapters/outbound/ai/claude-cli-practice.generator';
import { Sha256PracticeFingerprint } from './adapters/outbound/ai/sha256-practice.fingerprint';
import { GetPractice, GeneratePractice } from './application/use-cases/manage-practice';
import type { PracticeGenerator } from './application/ports/practice';
import { PRACTICE_GENERATOR } from './interviews.tokens';
const REPOSITORY = Symbol('PREPARATION_REPOSITORY');
const JOB_READER = Symbol('PREPARATION_JOB_READER');
@Module({
  imports: [AuthModule, DatabaseModule, JobDirectoryModule, ResumesModule, AiModule],
  controllers: [PreparationController, PracticeController],
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
      provide: PublicPracticeContextReader,
      inject: [JOBS_API, RESUMES_API, REPOSITORY],
      useFactory: (jobs: JobsApi, resumes: ResumesApi, preparations: PrismaPreparationRepository) =>
        new PublicPracticeContextReader(jobs, resumes, preparations),
    },
    {
      provide: PrismaPracticeRepository,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new PrismaPracticeRepository(db),
    },
    {
      provide: PRACTICE_GENERATOR,
      inject: [ClaudeProcessRunner],
      useFactory: (runner: ClaudeProcessRunner) => new ClaudeCliPracticeGenerator(runner),
    },
    {
      provide: GeneratePractice,
      inject: [PublicPracticeContextReader, PrismaPracticeRepository, PRACTICE_GENERATOR],
      useFactory: (
        context: PublicPracticeContextReader,
        repository: PrismaPracticeRepository,
        generator: PracticeGenerator,
      ) => new GeneratePractice(context, repository, generator, new Sha256PracticeFingerprint()),
    },
    {
      provide: GetPractice,
      inject: [PublicPracticeContextReader, PrismaPracticeRepository, GeneratePractice],
      useFactory: (
        context: PublicPracticeContextReader,
        repository: PrismaPracticeRepository,
        generation: GeneratePractice,
      ) => new GetPractice(context, repository, generation),
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
