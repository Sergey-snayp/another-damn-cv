import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { RewriteService } from './rewrite.service';
import { DiffService } from './diff.service';
import { TailorResumeService } from './tailor-resume.service';
import { ResumeController } from './resume.controller';

@Module({
  providers: [ResumeService, RewriteService, DiffService, TailorResumeService],
  controllers: [ResumeController],
  exports: [ResumeService, TailorResumeService],
})
export class ResumeModule {}
