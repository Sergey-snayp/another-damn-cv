import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import {
  AddApplication,
  ExportApplications,
  ImportApplications,
  SetApplicationResume,
  UpdateApplicationPreferences,
} from '../../../application/use-cases/manage-applications';
import { JobsErrorFilter } from './jobs-error.filter';
import { presentJob } from './jobs.presenter';
import {
  applicationSchema,
  applicationImportSchema,
  applicationPreferencesSchema,
  applicationResumeSchema,
  type ApplicationResumeBody,
  type ApplicationBody,
  type ApplicationImportBody,
  type ApplicationPreferencesBody,
} from './applications.schemas';

@Controller('jobs/applications')
@UseGuards(AuthGuard)
@UseFilters(JobsErrorFilter)
export class ApplicationsController {
  constructor(
    @Inject(AddApplication) private readonly add: AddApplication,
    @Inject(ImportApplications) private readonly importRows: ImportApplications,
    @Inject(UpdateApplicationPreferences) private readonly preferences: UpdateApplicationPreferences,
    @Inject(ExportApplications) private readonly exportRows: ExportApplications,
    @Inject(SetApplicationResume) private readonly setResume: SetApplicationResume,
  ) {}

  @Patch(':id/resume')
  async resume(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(applicationResumeSchema)) body: ApplicationResumeBody,
  ) {
    return presentJob(await this.setResume.execute(userId, id, body.resumeId));
  }

  @Get('export')
  async export(@CurrentUser() userId: string) {
    return (await this.exportRows.execute(userId)).map(presentJob);
  }

  @Post()
  async create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(applicationSchema)) body: ApplicationBody,
  ) {
    return presentJob(await this.add.execute(userId, body));
  }

  @Post('import')
  @HttpCode(200)
  import(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(applicationImportSchema)) body: ApplicationImportBody,
  ) {
    return this.importRows.execute(userId, body.rows);
  }

  @Patch('preferences')
  async updatePreferences(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(applicationPreferencesSchema)) body: ApplicationPreferencesBody,
  ) {
    return (await this.preferences.execute(userId, body.ids, body)).map(presentJob);
  }
}
