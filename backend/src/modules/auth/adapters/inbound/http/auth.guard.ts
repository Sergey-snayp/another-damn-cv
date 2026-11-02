import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './session';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.session?.userId) throw new UnauthorizedException('Not signed in.');
    request.userId = request.session.userId;
    return true;
  }
}
