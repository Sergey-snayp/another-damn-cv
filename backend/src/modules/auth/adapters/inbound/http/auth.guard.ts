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

/**
 * The web app's sign-in: its session cookie, or inside a job page (where the
 * cookie is not sent) an embed session token in `Authorization: Embed <token>`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH_API) private readonly auth: AuthApi) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (request.session?.userId) {
      request.userId = request.session.userId;
      return true;
    }
    const embed = /^Embed\s+(\S+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (!embed) throw new UnauthorizedException('Not signed in.');
    try {
      request.userId = await this.auth.resolveEmbedToken(embed);
    } catch (error) {
      if (error instanceof AuthenticationError) throw new UnauthorizedException(error.message);
      throw error;
    }
    return true;
  }
}
