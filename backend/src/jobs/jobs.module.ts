import { Module } from '@nestjs/common';
import { SyncTokenGuard } from '../auth/sync-token.guard';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { ResumeModule } from '../resume/resume.module';

@Module({
  imports: [ResumeModule],
  providers: [JobsService, SyncTokenGuard],
  controllers: [JobsController],
})
export class JobsModule {}
