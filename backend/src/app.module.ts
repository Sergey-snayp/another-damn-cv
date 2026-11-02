import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { CvImportModule } from './modules/cv-import/cv-import.module';
import { ResumesModule } from './modules/resumes/resumes.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { TailoringModule } from './modules/tailoring/tailoring.module';
import { ResumeRewriteModule } from './modules/resume-rewrite/resume-rewrite.module';

@Module({
  imports: [
    AuthModule,
    ProfilesModule,
    CvImportModule,
    ResumesModule,
    JobsModule,
    TailoringModule,
    ResumeRewriteModule,
  ],
})
export class AppModule {}
