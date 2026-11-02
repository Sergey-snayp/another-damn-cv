import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { ResumeOwnerGuard } from './resume-owner.guard';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import type { TailoringApi } from '../../../contracts';
import { TAILORING_API } from '../../../resumes.tokens';
import { TailoringErrorFilter } from './tailoring-error.filter';
const tailorSchema = z.object({ sourceResumeId: z.string().min(1).optional() });
type TailorInput = z.infer<typeof tailorSchema>;
@Controller()
@UseGuards(AuthGuard)
@UseFilters(TailoringErrorFilter)
export class TailoringController {
  constructor(@Inject(TAILORING_API) private readonly tailoring: TailoringApi) {}
  @Post('jobs/:id/tailor')
  @HttpCode(200)
  tailor(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tailorSchema)) body: TailorInput,
  ) {
    return this.tailoring.tailorForJob(userId, id, body.sourceResumeId);
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
