import { Module } from '@nestjs/common';
import { AiModule } from '../../shared/ai/ai.module';
import { ClaudeProcessRunner } from '../../shared/ai/claude-process.runner';
import { AuthModule } from '../auth/auth.module';
import { ResumesModule } from '../resumes/resumes.module';
import type { ResumesApi } from '../resumes/contracts';
import { RESUMES_API } from '../resumes/resumes.tokens';
import { RewriteResumeLine } from './application/use-cases/rewrite-resume-line';
import { ClaudeLineRewriter } from './adapters/outbound/ai/claude-line.rewriter';
import { RewriteController } from './adapters/inbound/http/rewrite.controller';

@Module({
  imports: [AuthModule, ResumesModule, AiModule],
  controllers: [RewriteController],
  providers: [
    {
      provide: RewriteResumeLine,
      inject: [RESUMES_API, ClaudeProcessRunner],
      useFactory: (resumes: ResumesApi, runner: ClaudeProcessRunner) =>
        new RewriteResumeLine(resumes, new ClaudeLineRewriter(runner)),
    },
  ],
})
export class ResumeRewriteModule {}
