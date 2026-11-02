import { ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { ResumeError } from '../../../application/errors';
@Catch(ResumeError)
export class ResumeErrorFilter implements ExceptionFilter {
  catch(error: ResumeError, host: ArgumentsHost): void {
    const statusCode = error.code === 'not-found' ? 404 : 400;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message: error.message, error: statusCode === 404 ? 'Not Found' : 'Bad Request' });
  }
}
