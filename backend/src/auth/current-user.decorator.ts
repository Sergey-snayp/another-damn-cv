import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './session';

/** `@CurrentUser() userId: string` — always the session's user, never the client's claim. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<AuthedRequest>();
  return request.userId;
});
