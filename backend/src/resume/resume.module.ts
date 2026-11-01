import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { ResumeService } from './resume.service';
import { RewriteService } from './rewrite.service';
import { DiffService } from './diff.service';
import { TailorResumeService } from './tailor-resume.service';
import { ResumeController } from './resume.controller';
import { ResumeOwnerGuard } from './resume-owner.guard';

@Module({
  imports: [ProfileModule],
  providers: [ResumeService, RewriteService, DiffService, TailorResumeService, ResumeOwnerGuard],
  controllers: [ResumeController],
  exports: [ResumeService, TailorResumeService],
})
export class ResumeModule {}
