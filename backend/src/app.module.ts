import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { ResumesModule } from './modules/resumes/resumes.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { InterviewsModule } from './modules/interviews/interviews.module';

@Module({
  imports: [AuthModule, ProfilesModule, ResumesModule, JobsModule, InterviewsModule],
})
export class AppModule {}
