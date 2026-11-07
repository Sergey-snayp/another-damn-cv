import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { AUTH_API } from '../auth/auth.tokens';
import type { AuthApi } from '../auth/contracts';
import { AuthIdentityReader } from './adapters/outbound/auth-identity.reader';
import { PrismaProfileRepository } from './adapters/outbound/prisma-profile.repository';
import type { ProfileRepository } from './application/ports/profile-repository';
import { EnsureProfile } from './application/use-cases/ensure-profile';
import { PROFILE_DIRECTORY, PROFILE_REPOSITORY, PROFILE_CAREER_API } from './profiles.tokens';
import { PrismaCareerProfileRepository } from './adapters/outbound/prisma-career-profile.repository';
import { GetProfileCareer } from './application/use-cases/get-profile-career';
import type { ProfileCareerApi, ProfileDirectory } from './contracts';

/** Does not import resumes or the combined profile HTTP view. */
@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [
    {
      provide: PrismaCareerProfileRepository,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new PrismaCareerProfileRepository(db),
    },
    {
      provide: GetProfileCareer,
      inject: [PROFILE_DIRECTORY, PrismaCareerProfileRepository],
      useFactory: (directory: ProfileDirectory, repository: PrismaCareerProfileRepository) =>
        new GetProfileCareer(directory, repository),
    },
    {
      provide: PROFILE_CAREER_API,
      inject: [GetProfileCareer],
      useFactory: (career: GetProfileCareer): ProfileCareerApi => ({
        read: (userId) => career.execute(userId),
      }),
    },
    {
      provide: PROFILE_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaProfileRepository(prisma),
    },
    {
      provide: PROFILE_DIRECTORY,
      inject: [PROFILE_REPOSITORY, AUTH_API],
      useFactory: (profiles: ProfileRepository, auth: AuthApi) =>
        new EnsureProfile(profiles, new AuthIdentityReader(auth)),
    },
  ],
  exports: [
    PROFILE_DIRECTORY,
    PROFILE_REPOSITORY,
    PROFILE_CAREER_API,
    GetProfileCareer,
    PrismaCareerProfileRepository,
  ],
})
export class ProfileDirectoryModule {}
