import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { LlmModule } from './llm/llm.module';
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { ImportModule } from './import/import.module';
import { ResumeModule } from './resume/resume.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    PrismaModule,
    LlmModule,
    AuthModule,
    ProfileModule,
    ImportModule,
    ResumeModule,
    JobsModule,
  ],
})
export class AppModule {}
