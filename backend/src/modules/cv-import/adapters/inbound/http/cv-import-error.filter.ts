import { BadRequestException, Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { CvImportError } from '../../../application/errors';

@Catch(CvImportError)
export class CvImportErrorFilter implements ExceptionFilter {
  catch(error: CvImportError, host: ArgumentsHost): void {
    const exception = new BadRequestException(error.message);
    host.switchToHttp().getResponse<Response>().status(exception.getStatus()).json(exception.getResponse());
  }
}
