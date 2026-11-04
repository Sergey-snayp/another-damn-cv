import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { AUTH_API } from '../auth/auth.tokens';
import type { AuthApi } from '../auth/contracts';
import { ResumesModule } from '../resumes/resumes.module';
import { RESUMES_API } from '../resumes/resumes.tokens';
import type { ResumesApi } from '../resumes/contracts';
import { ExtensionProfileController, ProfilesController } from './adapters/inbound/http/profiles.controller';
import { ProfileCareerController } from './adapters/inbound/http/profile-career.controller';
import { PrismaCareerProfileRepository } from './adapters/outbound/prisma-career-profile.repository';
import { ResumeImportSourceReader } from './adapters/outbound/resume-import-source.reader';
import { ImportProfileCareer } from './application/use-cases/import-profile-career';
import { GetCareerFields } from './application/use-cases/get-career-fields';
import { GetProfileCareer } from './application/use-cases/get-profile-career';
import { ResumeCareerReader } from './adapters/outbound/resume-career.reader';
import { ResumeSectionsAdapter } from './adapters/outbound/resume-sections.reader';
import { GetExtensionCareer } from './application/use-cases/get-extension-career';
import { ProfilesApplication } from './application/profile-api';
import type { ProfileCareerReader } from './application/ports/profile-career-reader';
import type { ProfileRepository } from './application/ports/profile-repository';
import { GetProfile } from './application/use-cases/get-profile';
import { UpdateProfile } from './application/use-cases/update-profile';
import type { ProfileDirectory } from './contracts';
import { ProfileDirectoryModule } from './profile-directory.module';
import { PROFILE_API, PROFILE_CAREER_READER, PROFILE_DIRECTORY, PROFILE_REPOSITORY } from './profiles.tokens';

@Module({
  imports: [AuthModule, ProfileDirectoryModule, ResumesModule, DatabaseModule],
  controllers: [ProfilesController, ExtensionProfileController, ProfileCareerController],
  providers: [
    {
      provide: GetProfileCareer,
      inject: [PROFILE_DIRECTORY, PrismaCareerProfileRepository],
      useFactory: (directory: ProfileDirectory, repository: PrismaCareerProfileRepository) =>
        new GetProfileCareer(directory, repository),
    },
    {
      provide: PrismaCareerProfileRepository,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new PrismaCareerProfileRepository(db),
    },
    {
      provide: ImportProfileCareer,
      inject: [PROFILE_DIRECTORY, PrismaCareerProfileRepository, RESUMES_API],
      useFactory: (
        directory: ProfileDirectory,
        repository: PrismaCareerProfileRepository,
        resumes: ResumesApi,
      ) => new ImportProfileCareer(directory, repository, new ResumeImportSourceReader(resumes)),
    },
    {
      provide: GetExtensionCareer,
      inject: [PrismaCareerProfileRepository, RESUMES_API],
      useFactory: (repository: PrismaCareerProfileRepository, resumes: ResumesApi) =>
        new GetExtensionCareer(repository, new ResumeSectionsAdapter(resumes)),
    },
    {
      provide: PROFILE_CAREER_READER,
      inject: [RESUMES_API, PrismaCareerProfileRepository],
      useFactory: (resumes: ResumesApi, repository: PrismaCareerProfileRepository) =>
        new GetCareerFields(repository, new ResumeCareerReader(resumes)),
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
