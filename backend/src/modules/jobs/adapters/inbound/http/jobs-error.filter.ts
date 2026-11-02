import {
  BadRequestException,
  Catch,
  ConflictException,
  NotFoundException,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { JobConflictError, JobInputError, JobNotFoundError } from '../../../application/errors';

@Catch(JobNotFoundError, JobInputError, JobConflictError)
export class JobsErrorFilter implements ExceptionFilter {
  catch(error: JobNotFoundError | JobInputError | JobConflictError, host: ArgumentsHost): void {
    const exception =
      error instanceof JobNotFoundError
        ? new NotFoundException(error.message)
        : error instanceof JobConflictError
          ? new ConflictException(error.message)
          : new BadRequestException(error.message);
    host.switchToHttp().getResponse<Response>().status(exception.getStatus()).json(exception.getResponse());
  }
}
