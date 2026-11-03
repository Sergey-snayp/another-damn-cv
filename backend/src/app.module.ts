import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { ResumesModule } from './modules/resumes/resumes.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { AnswersModule } from './modules/answers/answers.module';

@Module({
  imports: [AuthModule, ProfilesModule, ResumesModule, JobsModule, InterviewsModule, AnswersModule],
})
export class AppModule {}
