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
import { CurrentUser } from '../auth/current-user.decorator';
import { SyncTokenGuard } from '../auth/sync-token.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TailorResumeService } from '../resume/tailor-resume.service';
import { JobCaptureService } from './job-capture.service';
import {
  captureSchema,
  jobEditSchema,
  listQuerySchema,
  manualJobSchema,
  tailorSchema,
  undoStatusSchema,
  type CaptureInput,
  type JobEditInput,
  type ListQuery,
  type ManualJobInput,
  type TailorInput,
  type UndoStatusInput,
} from './jobs.schemas';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly capturing: JobCaptureService,
    private readonly tailoring: TailorResumeService,
  ) {}

  /**
   * The extension's "Send this job to the app".
   *
   * Bearer token rather than session, like /profile/sync. Saving the same job
   * again updates it; `created` says which happened.
   */
  @Post('capture')
  @UseGuards(SyncTokenGuard)
  capture(@CurrentUser() userId: string, @Body(new ZodValidationPipe(captureSchema)) body: CaptureInput) {
    return this.capturing.capture(userId, body);
  }

  @Get()
  @UseGuards(AuthGuard)
  list(@CurrentUser() userId: string, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.jobs.list(userId, query.status);
  }

  @Post()
  @UseGuards(AuthGuard)
  create(@CurrentUser() userId: string, @Body(new ZodValidationPipe(manualJobSchema)) body: ManualJobInput) {
    return this.capturing.createManual(userId, body);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.jobs.get(userId, id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(jobEditSchema)) body: JobEditInput,
  ) {
    return this.jobs.update(userId, id, body);
  }

  /** Reverts the job's latest move. Refused if it has moved again since. */
  @Post(':id/status/undo')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  undoStatus(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(undoStatusSchema)) body: UndoStatusInput,
  ) {
    return this.jobs.undoStatus(userId, id, body.eventId);
  }

  /** Reads the captured page again, discarding edits. */
  @Post(':id/reread')
  @UseGuards(AuthGuard)
  reread(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.capturing.reread(userId, id);
  }

  /**
   * Suggests a version of your resume for this job, on a copy made for it.
   * Nothing is saved to the resume itself: the suggestions wait for review.
   */
  @Post(':id/tailor')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  tailor(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tailorSchema)) body: TailorInput,
  ) {
    return this.tailoring.tailorForJob(userId, id, body.sourceResumeId);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.jobs.remove(userId, id);
  }
}
