import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthedRequest } from './session';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Route protection for the extension.
 *
 * The extension cannot carry the session cookie (see User.syncToken), so it
 * sends its bearer token instead. The guard turns that into the same
 * `request.userId` the session guard sets, so `@CurrentUser()` works on both.
 */
@Injectable()
export class SyncTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new UnauthorizedException('Missing sync token.');

    const user = await this.prisma.user.findUnique({ where: { syncToken: token }, select: { id: true } });
    if (!user) throw new UnauthorizedException('Invalid sync token.');

    (request as AuthedRequest).userId = user.id;
    return true;
  }
}
