import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** `@CurrentUser() userId: string` — always the session's user, never the client's claim. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request & { userId: string }>();
    return request.userId;
  },
);
