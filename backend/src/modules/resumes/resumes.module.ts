import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseModule } from '../../shared/database/database.module';
import { AiModule } from '../../shared/ai/ai.module';
import { ClaudeProcessRunner } from '../../shared/ai/claude-process.runner';
import { AuthModule } from '../auth/auth.module';
import { JobDirectoryModule } from '../jobs/job-directory.module';
import { JOBS_API } from '../jobs/jobs.tokens';
import type { JobsApi } from '../jobs/contracts';
import { PrismaService } from '../../shared/database/prisma.service';
import { ProfileDirectoryModule } from '../profiles/profile-directory.module';
import { PROFILE_DIRECTORY } from '../profiles/profiles.tokens';
import type { ProfileDirectory } from './application/ports/resume-repository';
import type { ResumeRepository } from './application/ports/resume-repository';
import { createResumesApi } from './application/resumes-api';
import { PrismaResumeRepository } from './adapters/outbound/persistence/prisma-resume.repository';
import { ResumesController } from './adapters/inbound/http/resumes.controller';
import { TailoringController } from './adapters/inbound/http/tailoring.controller';
import { RewriteController } from './adapters/inbound/http/rewrite.controller';
import { CvImportController } from './adapters/inbound/http/cv-import.controller';
import { ImportCv } from './application/use-cases/import-cv';
import { CvDocumentTextExtractor } from './adapters/outbound/documents/document-text.extractor';
import { ClaudeCvTranscriber } from './adapters/outbound/ai/import/claude-cv.transcriber';
import { TailorResume, GetPendingTailoring, DiscardTailoring } from './application/use-cases/tailor-resume';
import { RewriteResumeLine } from './application/use-cases/rewrite-resume-line';
import { ResumeTailoringWorkspace } from './application/services/tailoring-workspace';
import { PublicTailoringJobReader } from './adapters/outbound/modules/tailoring-job.reader';
import { ClaudeTailoringGenerator } from './adapters/outbound/ai/tailoring/claude-tailoring.generator';
import { ClaudeLineRewriter } from './adapters/outbound/ai/claude-line.rewriter';
import type { TailoringGenerator } from './application/ports/tailoring';
import type { ResumesApi, TailoringApi } from './contracts';
import {
  RESUMES_API,
  RESUME_REPOSITORY,
  TAILORING_API,
  TAILORING_GENERATOR,
  IMPORT_CV,
} from './resumes.tokens';
@Module({
  imports: [DatabaseModule, ProfileDirectoryModule, AuthModule, AiModule, JobDirectoryModule],
  controllers: [ResumesController, TailoringController, RewriteController, CvImportController],
  providers: [
    {
      provide: RESUME_REPOSITORY,
      inject: [PrismaService],
      useFactory: (database: PrismaService) => new PrismaResumeRepository(database),
    },
    {
      provide: RESUMES_API,
      inject: [RESUME_REPOSITORY, PROFILE_DIRECTORY],
      useFactory: (repository: ResumeRepository, profiles: ProfileDirectory) =>
        createResumesApi(repository, profiles, { next: randomUUID }),
    },
    {
      provide: TAILORING_GENERATOR,
      inject: [ClaudeProcessRunner],
      useFactory: (runner: ClaudeProcessRunner) => new ClaudeTailoringGenerator(runner),
    },
    {
      provide: TAILORING_API,
      inject: [JOBS_API, RESUMES_API, TAILORING_GENERATOR],
      useFactory: (jobs: JobsApi, resumes: ResumesApi, generator: TailoringGenerator): TailoringApi => {
        const workspace = new ResumeTailoringWorkspace(resumes);
        const tailor = new TailorResume(new PublicTailoringJobReader(jobs), workspace, generator);
        const pending = new GetPendingTailoring(workspace);
        const discard = new DiscardTailoring(workspace);
        return {
          tailorForJob: (userId, jobId, sourceResumeId) => tailor.execute({ userId, jobId, sourceResumeId }),
          pending: (userId, id) => pending.execute({ userId, id }),
          discard: (userId, id) => discard.execute({ userId, id }),
        };
      },
    },
    {
      provide: RewriteResumeLine,
      inject: [RESUMES_API, ClaudeProcessRunner],
      useFactory: (resumes: ResumesApi, runner: ClaudeProcessRunner) =>
        new RewriteResumeLine(resumes, new ClaudeLineRewriter(runner)),
    },
    {
      provide: IMPORT_CV,
      inject: [ClaudeProcessRunner],
      useFactory: (runner: ClaudeProcessRunner) =>
        new ImportCv(new CvDocumentTextExtractor(), new ClaudeCvTranscriber(runner), { next: randomUUID }),
    },
  ],
  exports: [RESUMES_API],
})
export class ResumesModule {}
