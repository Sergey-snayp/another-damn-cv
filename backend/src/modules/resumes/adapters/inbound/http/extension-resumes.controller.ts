import { Controller, Get, Inject, UseFilters, UseGuards } from '@nestjs/common';
import { CurrentUser, SyncTokenGuard } from '../../../../auth/http';
import type { ResumesApi } from '../../../contracts';
import { RESUMES_API } from '../../../resumes.tokens';
import { ResumeErrorFilter } from './resume-error.filter';

/**
 * The Chrome extension's CV picker. It signs in with the sync token, not the
 * session cookie, and only needs enough to choose a CV and know when its PDF
 * is out of date. The extension makes the PDF itself from the app's page.
 */
@Controller('extension/resumes')
@UseGuards(SyncTokenGuard)
@UseFilters(ResumeErrorFilter)
export class ExtensionResumesController {
  constructor(@Inject(RESUMES_API) private readonly resumes: ResumesApi) {}

  @Get() async list(@CurrentUser() userId: string) {
    const resumes = await this.resumes.list(userId);
    return resumes.map((resume) => ({
      id: resume.id,
      name: resume.name,
      targetRole: resume.targetRole,
      isPrimary: resume.isPrimary,
      tailoredForJob: resume.jobId !== null,
      updatedAt: resume.updatedAt,
    }));
  }
}
