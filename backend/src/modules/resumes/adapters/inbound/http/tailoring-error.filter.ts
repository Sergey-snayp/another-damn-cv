import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ResumeError } from '../../../contracts';
import { TailoringError } from '../../../application/tailoring-error';
@Catch(TailoringError, ResumeError)
export class TailoringErrorFilter implements ExceptionFilter {
  catch(error: TailoringError | ResumeError, host: ArgumentsHost): void {
    const statusCode =
      error.code === 'not-found'
        ? 404
        : error.code === 'pending'
          ? 409
          : error.code === 'unavailable'
            ? 503
            : 400;
    const labels: Record<number, string> = {
      400: 'Bad Request',
      404: 'Not Found',
      409: 'Conflict',
      503: 'Service Unavailable',
    };
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message: error.message, error: labels[statusCode] });
  }
}
