import {
  Body,
  Catch,
  Controller,
  Get,
  Header,
  Inject,
  Post,
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
import { ListSiteAccounts, ReadSiteLogin, RememberSiteAccount, SaveSiteLogin } from '../../../application/use-cases/site-login';

export const siteLoginSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

/** A site's host as the browser gives it: "ubc.wd10.myworkdayjobs.com". */
export const siteAccountSchema = z
  .object({ host: z.string().trim().toLowerCase().max(253).regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/) })
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
    @Inject(ListSiteAccounts) private readonly listSites: ListSiteAccounts,
    @Inject(RememberSiteAccount) private readonly rememberSite: RememberSiteAccount,
  ) {}

  /** The login and the job sites the person has an account on. */
  @Get()
  @Header('Cache-Control', 'no-store')
  async read(@CurrentUser() userId: string) {
    const [login, sites] = await Promise.all([this.readLogin.execute(userId), this.listSites.execute(userId)]);
    return { login, sites };
  }

  /** Signing in or creating an account worked on this site. */
  @Post('sites')
  @Header('Cache-Control', 'no-store')
  async addSite(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(siteAccountSchema)) body: z.infer<typeof siteAccountSchema>,
  ) {
    return { sites: await this.rememberSite.execute(userId, body.host) };
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
