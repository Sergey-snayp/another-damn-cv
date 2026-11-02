import { promisify } from 'node:util';
import { Body, Controller, Get, Inject, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_API, AUTH_SETTINGS, type AuthSettings } from '../../../auth.tokens';
import type { AuthApi, PublicUser } from '../../../contracts';
import { AuthenticationErrorFilter } from './authentication-error.filter';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import './session';

@Controller('auth')
@UseFilters(AuthenticationErrorFilter)
export class AuthController {
  constructor(
    @Inject(AUTH_API) private readonly auth: AuthApi,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}
  @Get('config')
  clientConfig() {
    return {
      googleClientId: this.settings.googleClientId,
      configured: Boolean(this.settings.googleClientId),
    };
  }
  @Post('google')
  async google(@Body() body: { credential: string }, @Req() request: Request) {
    const user = await this.auth.signInWithGoogle(body.credential);
    await promisify(request.session.regenerate.bind(request.session))();
    request.session.userId = user.id;
    return presentUser(user);
  }
  @Post('extension')
  async extension(@Body() body: { credential: string }) {
    const user = await this.auth.signInWithGoogle(body.credential);
    return { user: presentUser(user), syncToken: await this.auth.issueSyncToken(user.id) };
  }
  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() userId: string) {
    const user = await this.auth.findById(userId);
    return user ? presentUser(user) : null;
  }
  @Post('logout')
  async logout(@Req() request: Request) {
    await promisify(request.session.destroy.bind(request.session))();
    return { ok: true };
  }
}

function presentUser(user: PublicUser): PublicUser {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl };
}
