import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { ResumeOwnerGuard } from './resume-owner.guard';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import type { QuickTailoringSave, TailoringApi } from '../../../contracts';
import { TAILORING_API } from '../../../resumes.tokens';
import { TailoringErrorFilter } from './tailoring-error.filter';
import { ResumeErrorFilter } from './resume-error.filter';
import { resumeChangesSchema } from './resume.schemas';
import { resumeThemeSchema } from './resume-pdf.controller';
const tailorSchema = z.object({ sourceResumeId: z.string().min(1).optional() });
const quickSaveSchema = z
  .object({
    resumeId: z.string().min(1).nullable(),
    sourceResumeId: z.string().min(1),
    changes: resumeChangesSchema,
    theme: resumeThemeSchema,
    message: z.string().max(500).optional(),
  })
  .strict();
type TailorInput = z.infer<typeof tailorSchema>;
@Controller()
@UseGuards(AuthGuard)
@UseFilters(TailoringErrorFilter, ResumeErrorFilter)
export class TailoringController {
  constructor(@Inject(TAILORING_API) private readonly tailoring: TailoringApi) {}
  /** Opening Quick Tailor reads a draft; it creates no CV, snapshot or PDF. */
  @Get('jobs/:id/quick-tailor')
  previewQuick(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(tailorSchema)) query: TailorInput,
  ) {
    return this.tailoring.previewQuickTailoring(userId, id, query.sourceResumeId);
  }

  /** Only Save creates the job's CV document. */
  @Post('jobs/:id/quick-tailor')
  @HttpCode(200)
  saveQuick(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(quickSaveSchema)) body: QuickTailoringSave,
  ) {
    return this.tailoring.saveQuickTailoring(userId, id, body);
  }
  @Post('jobs/:id/tailor')
  @HttpCode(200)
  tailor(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tailorSchema)) body: TailorInput,
  ) {
    return this.tailoring.tailorForJob(userId, id, body.sourceResumeId);
  }
  /** Explicit legacy copy action. Opening Quick Tailor uses the read-only draft route. */
  @Post('jobs/:id/tailor-copy')
  @HttpCode(200)
  copy(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tailorSchema)) body: TailorInput,
  ) {
    return this.tailoring.copyForJob(userId, id, body.sourceResumeId);
  }

  @Get('resumes/:id/tailoring')
  @UseGuards(ResumeOwnerGuard)
  pending(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.tailoring.pending(userId, id);
  }
  @Delete('resumes/:id/tailoring')
  @HttpCode(204)
  @UseGuards(ResumeOwnerGuard)
  discard(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.tailoring.discard(userId, id);
  }
}
