import { Module } from '@nestjs/common';
import { AiModule } from '../../shared/ai/ai.module';
import { ClaudeProcessRunner } from '../../shared/ai/claude-process.runner';
import { JobsModule } from '../jobs/jobs.module';
import { JOBS_API } from '../jobs/jobs.tokens';
import type { JobsApi } from '../jobs/contracts';
import { ResumesModule } from '../resumes/resumes.module';
import { RESUMES_API } from '../resumes/resumes.tokens';
import type { ResumesApi } from '../resumes/contracts';
import { TailorResume, GetPendingTailoring, DiscardTailoring } from './application/use-cases/tailor-resume';
import type { TailoringGenerator } from './application/ports/tailoring';
import { PublicResumeWorkspace } from './adapters/outbound/modules/resume-workspace';
import { PublicTailoringJobReader } from './adapters/outbound/modules/job-reader';
import { ClaudeTailoringGenerator } from './adapters/outbound/ai/claude-tailoring.generator';
import { TailoringController } from './adapters/inbound/http/tailoring.controller';
import type { TailoringApi } from './contracts';
import { TAILORING_API, TAILORING_GENERATOR } from './tailoring.tokens';
@Module({
  imports: [AiModule, JobsModule, ResumesModule],
  controllers: [TailoringController],
  providers: [
    {
      provide: TAILORING_GENERATOR,
      inject: [ClaudeProcessRunner],
      useFactory: (runner: ClaudeProcessRunner) => new ClaudeTailoringGenerator(runner),
    },
    {
      provide: TAILORING_API,
      inject: [JOBS_API, RESUMES_API, TAILORING_GENERATOR],
      useFactory: (jobs: JobsApi, resumes: ResumesApi, generator: TailoringGenerator): TailoringApi => {
        const workspace = new PublicResumeWorkspace(resumes),
          tailor = new TailorResume(new PublicTailoringJobReader(jobs), workspace, generator),
          pending = new GetPendingTailoring(workspace),
          discard = new DiscardTailoring(workspace);
        return {
          tailorForJob: (userId, jobId, sourceResumeId) => tailor.execute({ userId, jobId, sourceResumeId }),
          pending: (userId, id) => pending.execute({ userId, id }),
          discard: (userId, id) => discard.execute({ userId, id }),
        };
      },
    },
  ],
  exports: [TAILORING_API],
})
export class TailoringModule {}
