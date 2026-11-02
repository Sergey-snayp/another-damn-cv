import { Module } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseModule } from '../../shared/database/database.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { ProfileDirectoryModule } from '../profiles/profile-directory.module';
import { PROFILE_DIRECTORY } from '../profiles/profiles.tokens';
import type { ProfileDirectory } from './application/ports/resume-repository';
import type { ResumeRepository } from './application/ports/resume-repository';
import { createResumesApi } from './application/resumes-api';
import { PrismaResumeRepository } from './adapters/outbound/persistence/prisma-resume.repository';
import { ResumesController } from './adapters/inbound/http/resumes.controller';
import { RESUMES_API, RESUME_REPOSITORY } from './resumes.tokens';
@Module({
  imports: [DatabaseModule, ProfileDirectoryModule],
  controllers: [ResumesController],
  providers: [
    {
      provide: RESUME_REPOSITORY,
      inject: [PrismaService],
      useFactory: (database: PrismaService) => new PrismaResumeRepository(database),
    },
    {
      provide: RESUMES_API,
      inject: [RESUME_REPOSITORY, PROFILE_DIRECTORY],
      useFactory: (repository: ResumeRepository, profiles: ProfileDirectory) =>
        createResumesApi(repository, profiles, { next: randomUUID }),
    },
  ],
  exports: [RESUMES_API],
})
export class ResumesModule {}
