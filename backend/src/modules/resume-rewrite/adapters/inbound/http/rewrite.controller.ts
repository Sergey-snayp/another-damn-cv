import { Body, Controller, Inject, Param, Post, UseFilters, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { ResumeOwnerGuard, ResumeErrorFilter } from '../../../../resumes/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { RewriteResumeLine } from '../../../application/use-cases/rewrite-resume-line';
import type { RewriteInput } from '../../../application/use-cases/rewrite-resume-line';

const rewriteSchema = z.object({
  text: z
    .string('There is nothing to rewrite yet.')
    .trim()
    .min(1, 'There is nothing to rewrite yet.')
    .max(5_000),
  instruction: z.string('Say what you want changed.').trim().min(1, 'Say what you want changed.').max(1_000),
  context: z.string().max(5_000).optional(),
  kind: z.enum(['bullet', 'summary', 'blurb']).optional(),
});

@Controller('resumes')
@UseGuards(AuthGuard, ResumeOwnerGuard)
@UseFilters(ResumeErrorFilter)
export class RewriteController {
  constructor(@Inject(RewriteResumeLine) private readonly rewrite: RewriteResumeLine) {}

  @Post(':id/rewrite')
  suggest(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rewriteSchema)) body: RewriteInput,
  ) {
    return this.rewrite.execute(userId, id, body);
  }
}
