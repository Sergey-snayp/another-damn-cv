import { Module } from '@nestjs/common';
import { SyncTokenGuard } from '../auth/sync-token.guard';
import { JobsController } from './jobs.controller';
import { JobCaptureService } from './job-capture.service';
import { JobReaderService } from './job-reader.service';
import { JobsService } from './jobs.service';
import { ResumeModule } from '../resume/resume.module';

@Module({
  imports: [ResumeModule],
  providers: [JobsService, JobCaptureService, JobReaderService, SyncTokenGuard],
  controllers: [JobsController],
})
export class JobsModule {}
