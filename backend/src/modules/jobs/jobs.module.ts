import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { AiModule } from '../../shared/ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { ResumesModule } from '../resumes/resumes.module';
import type { ResumesApi } from '../resumes/contracts';
import { RESUMES_API } from '../resumes/resumes.tokens';
import { GetJob } from './application/use-cases/get-job';
import { JobsController } from './adapters/inbound/http/jobs.controller';
import { PublicResumeLinkReader } from './adapters/outbound/modules/resume-link.reader';
import { jobsProviders } from './jobs.providers';
import { JOBS_API, RESUME_LINK_READER } from './jobs.tokens';

/** Registered at the composition root only when its routes replace the legacy routes. */
@Module({
  imports: [DatabaseModule, AiModule, AuthModule, ResumesModule],
  controllers: [JobsController],
  providers: [
    ...jobsProviders,
    {
      provide: RESUME_LINK_READER,
      useFactory: (api: ResumesApi) => new PublicResumeLinkReader(api),
      inject: [RESUMES_API],
    },
  ],
  exports: [GetJob, JOBS_API],
})
export class JobsModule {}
