import { Module } from '@nestjs/common';
import { JobDirectoryModule } from './job-directory.module';
import { AiModule } from '../../shared/ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { ResumesModule } from '../resumes/resumes.module';
import type { ResumesApi } from '../resumes/contracts';
import { RESUMES_API } from '../resumes/resumes.tokens';
import { GetJob } from './application/use-cases/get-job';
import { JobsController } from './adapters/inbound/http/jobs.controller';
import { ApplicationsController } from './adapters/inbound/http/applications.controller';
import { PublicApplicationResumeReader } from './adapters/outbound/modules/application-resume.reader';
import {
  AddApplication,
  ExportApplications,
  ImportApplications,
  SetApplicationResume,
  UpdateApplicationPreferences,
} from './application/use-cases/manage-applications';
import type { ApplicationRepository } from './application/ports/application-repository';
import type { JobRepository } from './application/ports/job-repository';
import { PublicResumeLinkReader } from './adapters/outbound/modules/resume-link.reader';
import { jobsProviders } from './jobs.providers';
import { JOB_REPOSITORY, RESUME_LINK_READER } from './jobs.tokens';

/** Registered at the composition root only when its routes replace the legacy routes. */
@Module({
  imports: [JobDirectoryModule, AiModule, AuthModule, ResumesModule],
  controllers: [JobsController, ApplicationsController],
  providers: [
    ...jobsProviders,
    {
      provide: AddApplication,
      inject: [JOB_REPOSITORY, RESUMES_API],
      useFactory: (jobs: ApplicationRepository, resumes: ResumesApi) =>
        new AddApplication(jobs, new PublicApplicationResumeReader(resumes)),
    },
    {
      provide: ImportApplications,
      inject: [JOB_REPOSITORY, RESUMES_API],
      useFactory: (jobs: ApplicationRepository, resumes: ResumesApi) =>
        new ImportApplications(jobs, new PublicApplicationResumeReader(resumes)),
    },
    {
      provide: UpdateApplicationPreferences,
      inject: [JOB_REPOSITORY],
      useFactory: (jobs: ApplicationRepository) => new UpdateApplicationPreferences(jobs),
    },
    {
      provide: ExportApplications,
      inject: [JOB_REPOSITORY],
      useFactory: (jobs: ApplicationRepository) => new ExportApplications(jobs),
    },
    {
      provide: SetApplicationResume,
      inject: [JOB_REPOSITORY, RESUMES_API],
      useFactory: (jobs: JobRepository, resumes: ResumesApi) =>
        new SetApplicationResume(jobs, new PublicApplicationResumeReader(resumes)),
    },
    {
      provide: RESUME_LINK_READER,
      useFactory: (api: ResumesApi) => new PublicResumeLinkReader(api),
      inject: [RESUMES_API],
    },
  ],
  exports: [GetJob, JobDirectoryModule],
})
export class JobsModule {}
