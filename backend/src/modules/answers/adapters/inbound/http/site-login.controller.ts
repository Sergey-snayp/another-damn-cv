import {
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Put,
  Query,
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
import {
  ForgetSiteOwnLogin,
  ListSiteAccounts,
  ListSitesWithOwnLogin,
  ReadSiteLogin,
  RememberSiteAccount,
  SaveSiteLogin,
  SaveSiteOwnLogin,
} from '../../../application/use-cases/site-login';

export const siteLoginSchema = z
  .object({
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

/** A site's host as the browser gives it: "ubc.wd10.myworkdayjobs.com". */
export const hostSchema = z.string().trim().toLowerCase().max(253).regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
export const siteAccountSchema = z.object({ host: hostSchema }).strict();
/** The page asking for its login: its host, or none for the one saved login. */
export const siteLoginQuerySchema = z.object({ host: hostSchema.optional() }).strict();

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
    @Inject(SaveSiteOwnLogin) private readonly saveOwn: SaveSiteOwnLogin,
    @Inject(ForgetSiteOwnLogin) private readonly forgetOwn: ForgetSiteOwnLogin,
    @Inject(ListSitesWithOwnLogin) private readonly listOwn: ListSitesWithOwnLogin,
  ) {}

  /**
   * The login and the job sites the person has an account on. With `host`,
   * that site's own login when it has one; `ownLogins` lists those sites.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  async read(
    @CurrentUser() userId: string,
    @Query(new ZodValidationPipe(siteLoginQuerySchema)) query: z.infer<typeof siteLoginQuerySchema>,
  ) {
    const [login, sites, ownLogins] = await Promise.all([this.readLogin.execute(userId, query.host), this.listSites.execute(userId), this.listOwn.execute(userId)]);
    return { login, sites, ownLogins };
  }

  /** One site keeps its own login: a password changed on that company's site only. */
  @Put('sites/:host/login')
  @Header('Cache-Control', 'no-store')
  async saveForSite(
    @CurrentUser() userId: string,
    @Param('host', new ZodValidationPipe(hostSchema)) host: string,
    @Body(new ZodValidationPipe(siteLoginSchema)) body: z.infer<typeof siteLoginSchema>,
  ) {
    return { login: await this.saveOwn.execute(userId, host, body) };
  }

  /** The site goes back to the one saved login. */
  @Delete('sites/:host/login')
  @Header('Cache-Control', 'no-store')
  async forgetForSite(@CurrentUser() userId: string, @Param('host', new ZodValidationPipe(hostSchema)) host: string) {
    return { ownLogins: await this.forgetOwn.execute(userId, host) };
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
