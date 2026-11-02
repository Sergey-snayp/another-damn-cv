import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { ResumesApi } from '../../../contracts';
import { RESUMES_API } from '../../../resumes.tokens';
@Injectable()
export class ResumeOwnerGuard implements CanActivate {
  constructor(@Inject(RESUMES_API) private readonly resumes: ResumesApi) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ userId: string; params: Record<string, string> }>();
    if (request.params.id) await this.resumes.assertOwned(request.userId, request.params.id);
    return true;
  }
}
