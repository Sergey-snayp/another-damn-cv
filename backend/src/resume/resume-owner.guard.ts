import { type CanActivate, type ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthedRequest } from '../auth/session';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A resume route with an `:id` only runs for the resume's owner.
 *
 * Runs after AuthGuard, which sets `userId`. Someone else's resume is a 404,
 * not a 403: whether an id exists is not theirs to learn.
 */
@Injectable()
export class ResumeOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const resumeId = request.params.id;
    if (typeof resumeId !== 'string' || !resumeId) return true;

    const owned = await this.prisma.resume.count({
      where: { id: resumeId, profile: { userId: request.userId } },
    });
    if (owned === 0) throw new NotFoundException('No such resume.');
    return true;
  }
}
