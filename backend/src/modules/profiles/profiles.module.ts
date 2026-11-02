import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AUTH_API } from '../auth/auth.tokens';
import type { AuthApi } from '../auth/contracts';
import { ResumesModule } from '../resumes/resumes.module';
import { RESUMES_API } from '../resumes/resumes.tokens';
import type { ResumesApi } from '../resumes/contracts';
import { ProfilesController } from './adapters/inbound/http/profiles.controller';
import { ResumeCareerReader } from './adapters/outbound/resume-career.reader';
import { ProfilesApplication } from './application/profile-api';
import type { ProfileCareerReader } from './application/ports/profile-career-reader';
import type { ProfileRepository } from './application/ports/profile-repository';
import { GetProfile } from './application/use-cases/get-profile';
import { UpdateProfile } from './application/use-cases/update-profile';
import type { ProfileDirectory } from './contracts';
import { ProfileDirectoryModule } from './profile-directory.module';
import { PROFILE_API, PROFILE_CAREER_READER, PROFILE_DIRECTORY, PROFILE_REPOSITORY } from './profiles.tokens';

@Module({
  imports: [AuthModule, ProfileDirectoryModule, ResumesModule],
  controllers: [ProfilesController],
  providers: [
    {
      provide: PROFILE_CAREER_READER,
      inject: [RESUMES_API],
      useFactory: (resumes: ResumesApi) => new ResumeCareerReader(resumes),
    },
    {
      provide: PROFILE_API,
      inject: [PROFILE_DIRECTORY, PROFILE_REPOSITORY, PROFILE_CAREER_READER, AUTH_API],
      useFactory: (
        directory: ProfileDirectory,
        repository: ProfileRepository,
        career: ProfileCareerReader,
        auth: AuthApi,
      ) => {
        const get = new GetProfile(directory, career);
        return new ProfilesApplication(get, new UpdateProfile(directory, repository, get), auth);
      },
    },
  ],
  exports: [PROFILE_API],
})
export class ProfilesModule {}
