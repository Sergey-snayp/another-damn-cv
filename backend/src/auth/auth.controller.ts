import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { ProfileService } from '../profile/profile.service';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { config } from '../config';
import './session';

interface GoogleSignInBody {
  /** The ID token from Google Identity Services. */
  credential: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly profile: ProfileService,
  ) {}

  /** Tells the frontend which client id to render the Google button with. */
  @Get('config')
  clientConfig() {
    return {
      googleClientId: config.google.clientId,
      configured: Boolean(config.google.clientId),
    };
  }

  @Post('google')
  async google(@Body() body: GoogleSignInBody, @Req() request: Request) {
    const user = await this.auth.signInWithGoogle(body.credential);

    // Rotate the session id on privilege change, so a session fixated before
    // login cannot be reused afterwards.
    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    request.session.userId = user.id;

    return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl };
  }

  /**
   * Sign-in for the browser extension.
   *
   * Same Google ID token, same verification as the web app. The difference is
   * what comes back: a bearer token instead of a session cookie, because a
   * chrome-extension:// origin cannot receive a SameSite cookie. The extension
   * stores it and uses it for /profile/sync.
   */
  @Post('extension')
  async extension(@Body() body: GoogleSignInBody) {
    const user = await this.auth.signInWithGoogle(body.credential);
    const syncToken = await this.profile.issueSyncToken(user.id);

    return {
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
      syncToken,
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() userId: string) {
    const user = await this.auth.findById(userId);
    if (!user) return null;

    return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl };
  }

  @Post('logout')
  logout(@Req() request: Request) {
    return new Promise((resolve, reject) => {
      request.session.destroy((err) => (err ? reject(err) : resolve({ ok: true })));
    });
  }
}
