import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AUTH_API } from '../../../auth.tokens';
import type { AuthApi } from '../../../contracts';
import { AuthenticationError } from '../../../application/errors';
import type { AuthedRequest } from './session';
import { syncToken } from './sync-token';

@Injectable()
export class SyncTokenGuard implements CanActivate {
  constructor(@Inject(AUTH_API) private readonly auth: AuthApi) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    try {
      request.userId = await this.auth.resolveSyncToken(syncToken(request.headers.authorization));
    } catch (error) {
      if (error instanceof AuthenticationError) throw new UnauthorizedException(error.message);
      throw error;
    }
    return true;
  }
}
