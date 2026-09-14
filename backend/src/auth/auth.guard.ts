import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import './session';

/**
 * Route protection.
 *
 * The user id comes from the server-side session, never from a header or body,
 * so a client cannot assert who it is.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.session?.userId;

    if (!userId) {
      throw new UnauthorizedException('Not signed in.');
    }

    // Handed to controllers so every query can be scoped to this user.
    (request as Request & { userId: string }).userId = userId;
    return true;
  }
}
