import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { LlmModule } from './llm/llm.module';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { ImportModule } from './import/import.module';
import { ResumeModule } from './resume/resume.module';
import { TailorModule } from './tailor/tailor.module';
import { ScannerModule } from './scanner/scanner.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    PrismaModule,
    LlmModule,
    AuthModule,
    ProfileModule,
    ImportModule,
    ResumeModule,
    TailorModule,
    ScannerModule,
    JobsModule,
  ],
})
export class AppModule {}
