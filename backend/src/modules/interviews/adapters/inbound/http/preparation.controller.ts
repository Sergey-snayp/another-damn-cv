import {
  Body,
  Catch,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  UseFilters,
  UseGuards,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import {
  INTERVIEW_TYPES,
  PreparationNotFoundError,
  type PreparationInput,
} from '../../../domain/preparation';
import { GetPreparation, SavePreparation } from '../../../application/use-cases/manage-preparation';
export const preparationSchema = z
  .object({
    interviewType: z.enum(INTERVIEW_TYPES).nullable(),
    interviewer: z.string().trim().max(300),
    instructions: z.string().max(6000),
    notes: z.string().max(12000),
    questions: z.string().max(6000),
  })
  .strict();
@Catch(PreparationNotFoundError)
class PreparationErrorFilter implements ExceptionFilter {
  catch(error: PreparationNotFoundError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(404).json({ statusCode: 404, message: error.message });
  }
}
@Controller('jobs/:jobId/preparation')
@UseGuards(AuthGuard)
@UseFilters(PreparationErrorFilter)
export class PreparationController {
  constructor(
    @Inject(GetPreparation) private readonly get: GetPreparation,
    @Inject(SavePreparation) private readonly save: SavePreparation,
  ) {}
  @Get() read(@CurrentUser() userId: string, @Param('jobId') jobId: string) {
    return this.get.execute(userId, jobId);
  }
  @Put() update(
    @CurrentUser() userId: string,
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(preparationSchema)) input: PreparationInput,
  ) {
    return this.save.execute(userId, jobId, input);
  }
}
