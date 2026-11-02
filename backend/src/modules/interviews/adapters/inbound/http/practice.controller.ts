import {
  Body,
  Catch,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseFilters,
  UseGuards,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { GeneratePractice, GetPractice } from '../../../application/use-cases/manage-practice';
import { PracticeError, PRACTICE_KINDS, type PracticeKind } from '../../../domain/practice';
import { PreparationNotFoundError } from '../../../domain/preparation';

const requestSchema = z.object({ regenerate: z.boolean().optional() }).strict();
@Catch(PracticeError, PreparationNotFoundError)
class PracticeErrorFilter implements ExceptionFilter {
  catch(error: PracticeError | PreparationNotFoundError, host: ArgumentsHost) {
    const status =
      error instanceof PreparationNotFoundError
        ? 404
        : { invalid: 400, busy: 409, unavailable: 503, 'invalid-output': 502 }[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message: error.message });
  }
}
@Controller('jobs/:jobId/preparation/practice')
@UseGuards(AuthGuard)
@UseFilters(PracticeErrorFilter)
export class PracticeController {
  constructor(
    @Inject(GetPractice) private readonly read: GetPractice,
    @Inject(GeneratePractice) private readonly generate: GeneratePractice,
  ) {}
  @Get() get(@CurrentUser() userId: string, @Param('jobId') jobId: string) {
    return this.read.execute(userId, jobId);
  }
  @Post(':kind')
  @HttpCode(200)
  post(
    @CurrentUser() userId: string,
    @Param('jobId') jobId: string,
    @Param('kind', new ZodValidationPipe(z.enum(PRACTICE_KINDS))) kind: PracticeKind,
    @Body(new ZodValidationPipe(requestSchema)) input: { regenerate?: boolean },
  ) {
    return this.generate.execute(userId, jobId, kind, input.regenerate);
  }
}
