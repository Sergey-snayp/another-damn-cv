import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, SyncTokenGuard } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { CaptureJob } from '../../../application/use-cases/capture-job';
import { FindCapturedJob } from '../../../application/use-cases/find-captured-job';
import { GetPostingDates } from '../../../application/use-cases/get-posting-dates';
import { RecordApplication } from '../../../application/use-cases/manage-applications';
import { CreateManualJob } from '../../../application/use-cases/create-manual-job';
import { DeleteJob } from '../../../application/use-cases/delete-job';
import { GetJob } from '../../../application/use-cases/get-job';
import { ListJobs } from '../../../application/use-cases/list-jobs';
import { RereadJob } from '../../../application/use-cases/reread-job';
import { UndoJobStatus } from '../../../application/use-cases/undo-job-status';
import { UpdateJob } from '../../../application/use-cases/update-job';
import { JobsErrorFilter } from './jobs-error.filter';
import {
  captureSchema,
  jobEditSchema,
  listQuerySchema,
  lookupQuerySchema,
  recordApplicationSchema,
  type RecordApplicationInput,
  manualJobSchema,
  undoStatusSchema,
  type CaptureInput,
  type JobEditInput,
  type ListQuery,
  type ManualJobInput,
  type UndoStatusInput,
} from './jobs.schemas';
import { presentJob, presentJobDetail, presentJobSummary } from './jobs.presenter';

@Controller('jobs')
@UseFilters(JobsErrorFilter)
export class JobsController {
  constructor(
    @Inject(GetJob) private readonly getJob: GetJob,
    @Inject(ListJobs) private readonly listJobs: ListJobs,
    @Inject(UpdateJob) private readonly updateJob: UpdateJob,
    @Inject(UndoJobStatus) private readonly undoJobStatus: UndoJobStatus,
    @Inject(DeleteJob) private readonly deleteJob: DeleteJob,
    @Inject(CaptureJob) private readonly captureJob: CaptureJob,
    @Inject(FindCapturedJob) private readonly findCapturedJob: FindCapturedJob,
    @Inject(GetPostingDates) private readonly postingDates: GetPostingDates,
    @Inject(RecordApplication) private readonly recordApplication: RecordApplication,
    @Inject(CreateManualJob) private readonly createManualJob: CreateManualJob,
    @Inject(RereadJob) private readonly rereadJob: RereadJob,
  ) {}

  @Post('capture')
  @UseGuards(SyncTokenGuard)
  async capture(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(captureSchema)) body: CaptureInput,
  ) {
    const { job, created } = await this.captureJob.execute(userId, body);
    return { job: presentJob(job), created };
  }

  /** The CV and answers the extension used on this saved job's form. */
  @Post(':id/application')
  @HttpCode(200)
  @UseGuards(SyncTokenGuard)
  async application(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recordApplicationSchema)) body: RecordApplicationInput,
  ) {
    return presentJob(await this.recordApplication.execute(userId, id, body));
  }

  /** When the page's job was posted, from its job board: the extension's job card shows "Posted on …". */
  @Get('posting-date')
  @UseGuards(SyncTokenGuard)
  async postingDate(@Query(new ZodValidationPipe(lookupQuerySchema)) query: { url: string }) {
    return { posting: await this.postingDates.execute(query.url) };
  }

  /** Whether the page's job is saved: the extension's job card shows "Saved". */
  @Get('lookup')
  @UseGuards(SyncTokenGuard)
  async lookup(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(lookupQuerySchema)) query: { url: string },
  ) {
    const job = await this.findCapturedJob.execute(userId, query.url);
    return {
      job: job && {
        id: job.id,
        title: job.title,
        company: job.company,
        companyLogo: job.companyLogo,
        status: job.status,
        appliedAt: job.appliedAt?.toISOString() ?? null,
        capturedAt: job.capturedAt.toISOString(),
      },
    };
  }

  @Get()
  @UseGuards(AuthGuard)
  async list(@CurrentUser() userId: string, @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    const jobs = await this.listJobs.execute(userId, query.status);
    return jobs.map(({ job, tailoredResumeId }) => presentJobSummary(job, tailoredResumeId));
  }

  @Post()
  @UseGuards(AuthGuard)
  async create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(manualJobSchema)) body: ManualJobInput,
  ) {
    return presentJob(await this.createManualJob.execute(userId, body));
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  async get(@CurrentUser() userId: string, @Param('id') id: string) {
    return presentJobDetail(await this.getJob.execute(userId, id));
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(jobEditSchema)) body: JobEditInput,
  ) {
    return presentJobDetail(await this.updateJob.execute(userId, id, body));
  }

  @Post(':id/status/undo')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async undoStatus(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(undoStatusSchema)) body: UndoStatusInput,
  ) {
    return presentJobDetail(await this.undoJobStatus.execute(userId, id, body.eventId));
  }

  @Post(':id/reread')
  @UseGuards(AuthGuard)
  async reread(@CurrentUser() userId: string, @Param('id') id: string) {
    return presentJobDetail(await this.rereadJob.execute(userId, id));
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.deleteJob.execute(userId, id);
  }
}
