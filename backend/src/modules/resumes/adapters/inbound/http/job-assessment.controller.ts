import { Body, Controller, HttpCode, Inject, Post, UseFilters, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { TailoringErrorFilter } from './tailoring-error.filter';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { AssessJobFit } from '../../../application/use-cases/assess-job-fit';

const schema = z.object({ jobId: z.string().trim().min(1).max(100) }).strict();

@Controller('profile')
@UseGuards(AuthGuard)
@UseFilters(TailoringErrorFilter)
export class JobAssessmentController {
  constructor(@Inject(AssessJobFit) private readonly assessment: AssessJobFit) {}

  @Post('job-assessment')
  @HttpCode(200)
  assess(@CurrentUser() userId: string, @Body(new ZodValidationPipe(schema)) body: z.infer<typeof schema>) {
    return this.assessment.execute(userId, body.jobId);
  }
}
