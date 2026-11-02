import { Catch, UnauthorizedException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticationError } from '../../../application/errors';

@Catch(AuthenticationError)
export class AuthenticationErrorFilter implements ExceptionFilter {
  catch(error: AuthenticationError, host: ArgumentsHost): void {
    const exception = new UnauthorizedException(error.message);
    host.switchToHttp().getResponse<Response>().status(exception.getStatus()).json(exception.getResponse());
  }
}
