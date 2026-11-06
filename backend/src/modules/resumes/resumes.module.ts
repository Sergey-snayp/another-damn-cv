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
import { ResumeAssistantController } from './adapters/inbound/http/resume-assistant.controller';
import { ResumeAssistant } from './application/use-cases/resume-assistant';
import { ClaudeResumeChat } from './adapters/outbound/ai/claude-resume-chat';
import { ClaudeSkillTailor } from './adapters/outbound/ai/claude-skill.tailor';
import { ClaudeSummaryWriter } from './adapters/outbound/ai/claude-summary.writer';
import { PrismaAiSettingsStore } from './adapters/outbound/persistence/prisma-ai-settings.store';
import { PrismaTechnologyNoteStore } from './adapters/outbound/persistence/prisma-technology-note.store';
import { ClaudeTechnologyDescriber } from './adapters/outbound/ai/claude-technology.describer';
import { DescribeTechnology } from './application/use-cases/describe-technology';
import { CvImportController } from './adapters/inbound/http/cv-import.controller';
import { ExtensionResumesController } from './adapters/inbound/http/extension-resumes.controller';
import {
  ExtensionResumePdfController,
  PrintResumeController,
  ResumePdfController,
} from './adapters/inbound/http/resume-pdf.controller';
import { PrismaResumePdfStore } from './adapters/outbound/persistence/prisma-resume-pdf.store';
import { HmacPrintTokens } from './adapters/outbound/pdf/print-tokens';
import { PuppeteerPdfRenderer } from './adapters/outbound/pdf/puppeteer-pdf.renderer';
import { ResumePdfs } from './application/use-cases/resume-pdfs';
import { config } from '../../shared/config/config';
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
  PDF_RENDERER,
} from './resumes.tokens';
import type { PdfRenderer } from './application/ports/resume-pdf';
@Module({
  imports: [DatabaseModule, ProfileDirectoryModule, AuthModule, AiModule, JobDirectoryModule],
  controllers: [
    ResumesController,
    TailoringController,
    RewriteController,
    ResumeAssistantController,
    CvImportController,
    ExtensionResumesController,
    ExtensionResumePdfController,
    ResumePdfController,
    PrintResumeController,
  ],
  providers: [
    {
      provide: PDF_RENDERER,
      useFactory: (): PdfRenderer =>
        config.pdfRendering === 'off'
          ? { render: () => Promise.reject(new Error('PDF rendering is off on this server.')) }
          : new PuppeteerPdfRenderer(config.chromePath),
    },
    {
      provide: ResumePdfs,
      inject: [RESUMES_API, PrismaService, PDF_RENDERER],
      useFactory: (resumes: ResumesApi, database: PrismaService, renderer: PdfRenderer) =>
        new ResumePdfs(
          resumes,
          new PrismaResumePdfStore(database),
          renderer,
          new HmacPrintTokens(config.sessionSecret),
          (id, token) =>
            `${config.frontendUrl}/print/resumes/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
        ),
    },
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
        const reader = new PublicTailoringJobReader(jobs);
        const tailor = new TailorResume(reader, workspace, generator);
        const pending = new GetPendingTailoring(workspace);
        const discard = new DiscardTailoring(workspace);
        return {
          previewQuickTailoring: async (userId, jobId, sourceResumeId) =>
            resumes.previewQuickTailoring(
              userId,
              await reader.getForTailoring(userId, jobId),
              sourceResumeId,
            ),
          saveQuickTailoring: async (userId, jobId, input) =>
            resumes.saveQuickTailoring(userId, await reader.getForTailoring(userId, jobId), input),
          tailorForJob: (userId, jobId, sourceResumeId) => tailor.execute({ userId, jobId, sourceResumeId }),
          pending: (userId, id) => pending.execute({ userId, id }),
          discard: (userId, id) => discard.execute({ userId, id }),
          copyForJob: async (userId, jobId, sourceResumeId) => {
            const job = await reader.getForTailoring(userId, jobId);
            return { resumeId: (await workspace.forJob(userId, job, sourceResumeId)).id };
          },
        };
      },
    },
    {
      provide: ResumeAssistant,
      inject: [RESUMES_API, JOBS_API, PrismaService, ClaudeProcessRunner],
      useFactory: (
        resumes: ResumesApi,
        jobs: JobsApi,
        database: PrismaService,
        runner: ClaudeProcessRunner,
      ) =>
        new ResumeAssistant(
          resumes,
          new PublicTailoringJobReader(jobs),
          new PrismaAiSettingsStore(database),
          new ClaudeResumeChat(runner),
          new ClaudeLineRewriter(runner),
          new ClaudeSkillTailor(runner),
          new ClaudeSummaryWriter(runner),
        ),
    },
    {
      provide: DescribeTechnology,
      inject: [RESUMES_API, PrismaService, ClaudeProcessRunner],
      useFactory: (resumes: ResumesApi, database: PrismaService, runner: ClaudeProcessRunner) =>
        new DescribeTechnology(
          resumes,
          new PrismaTechnologyNoteStore(database),
          new ClaudeTechnologyDescriber(runner),
        ),
    },
    {
      provide: RewriteResumeLine,
      inject: [RESUMES_API, ClaudeProcessRunner, ResumeAssistant],
      useFactory: (resumes: ResumesApi, runner: ClaudeProcessRunner, assistant: ResumeAssistant) =>
        new RewriteResumeLine(resumes, new ClaudeLineRewriter(runner), assistant),
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
