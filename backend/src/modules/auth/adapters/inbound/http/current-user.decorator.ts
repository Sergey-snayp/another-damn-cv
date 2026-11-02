import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './session';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<AuthedRequest>().userId,
);
