import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SyncTokenGuard } from '../auth/sync-token.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JobsService } from './jobs.service';
import { TailorResumeService } from '../resume/tailor-resume.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly tailor: TailorResumeService,
  ) {}

  /**
   * The extension's "Send this job to the app".
   *
   * Bearer token rather than session, like /profile/sync. Saving the same job
   * again updates it; `created` says which happened.
   */
  @Post('capture')
  @UseGuards(SyncTokenGuard)
  capture(@CurrentUser() userId: string, @Body() body: unknown) {
    return this.jobs.capture(userId, body);
  }

  @Get()
  @UseGuards(AuthGuard)
  list(@CurrentUser() userId: string, @Query('status') status?: string) {
    return this.jobs.list(userId, status);
  }

  @Post()
  @UseGuards(AuthGuard)
  create(@CurrentUser() userId: string, @Body() body: unknown) {
    return this.jobs.createManual(userId, body);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.jobs.get(userId, id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  update(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.jobs.update(userId, id, body);
  }

  /** Reverts the job's latest move. Refused if it has moved again since. */
  @Post(':id/status/undo')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  undoStatus(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: { eventId?: unknown }) {
    return this.jobs.undoStatus(userId, id, body?.eventId);
  }

  /** Reads the captured page again, discarding edits. */
  @Post(':id/reread')
  @UseGuards(AuthGuard)
  reread(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.jobs.reread(userId, id);
  }

  /**
   * Suggests a version of your resume for this job, on a copy made for it.
   * Nothing is saved to the resume itself: the suggestions wait for review.
   */
  @Post(':id/tailor')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  tailorResume(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { sourceResumeId?: unknown },
  ) {
    const source =
      typeof body?.sourceResumeId === 'string' && body.sourceResumeId ? body.sourceResumeId : undefined;
    return this.tailor.tailorForJob(userId, id, source);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.jobs.remove(userId, id);
  }
}
