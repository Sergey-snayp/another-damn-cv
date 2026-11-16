import {
  Body,
  Catch,
  Controller,
  Get,
  Header,
  Inject,
  Put,
  UseFilters,
  UseGuards,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, SyncTokenGuard } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { SiteLoginUnreadableError } from '../../../domain/site-login';
import { ReadSiteLogin, SaveSiteLogin } from '../../../application/use-cases/site-login';

export const siteLoginSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

@Catch(SiteLoginUnreadableError)
class SiteLoginErrorFilter implements ExceptionFilter {
  catch(error: SiteLoginUnreadableError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(409).json({ statusCode: 409, message: error.message });
  }
}

/** The extension's job-site login: read to fill an account form, saved when it makes one. Never cached. */
@Controller('extension/site-login')
@UseGuards(SyncTokenGuard)
@UseFilters(SiteLoginErrorFilter)
export class ExtensionSiteLoginController {
  constructor(
    @Inject(ReadSiteLogin) private readonly readLogin: ReadSiteLogin,
    @Inject(SaveSiteLogin) private readonly saveLogin: SaveSiteLogin,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async read(@CurrentUser() userId: string) {
    return { login: await this.readLogin.execute(userId) };
  }

  @Put()
  @Header('Cache-Control', 'no-store')
  async save(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(siteLoginSchema)) body: z.infer<typeof siteLoginSchema>,
  ) {
    return { login: await this.saveLogin.execute(userId, body) };
  }
}
