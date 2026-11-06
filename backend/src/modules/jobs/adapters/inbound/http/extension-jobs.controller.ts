import { Body, Controller, Get, Inject, Param, Patch, UseFilters, UseGuards } from '@nestjs/common';
import { CurrentUser, SyncTokenGuard } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { GetJob } from '../../../application/use-cases/get-job';
import { UpdateJob } from '../../../application/use-cases/update-job';
import { JobsErrorFilter } from './jobs-error.filter';
import { extensionJobEditSchema, type ExtensionJobEditInput } from './jobs.schemas';
import { presentJobDetail } from './jobs.presenter';

@Controller('extension/jobs')
@UseGuards(SyncTokenGuard)
@UseFilters(JobsErrorFilter)
export class ExtensionJobsController {
  constructor(
    @Inject(GetJob) private readonly getJob: GetJob,
    @Inject(UpdateJob) private readonly updateJob: UpdateJob,
  ) {}

  @Get(':id')
  async get(@CurrentUser() userId: string, @Param('id') id: string) {
    return presentJobDetail(await this.getJob.execute(userId, id));
  }

  @Patch(':id')
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(extensionJobEditSchema)) body: ExtensionJobEditInput,
  ) {
    return presentJobDetail(await this.updateJob.execute(userId, id, body));
  }
}
