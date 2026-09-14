import { Body, Controller, Get, Headers, Post, Put, UnauthorizedException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProfileService } from './profile.service';
import type { CandidateProfile } from './profile.types';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @UseGuards(AuthGuard)
  get(@CurrentUser() userId: string) {
    return this.profile.get(userId);
  }

  @Put()
  @UseGuards(AuthGuard)
  save(@CurrentUser() userId: string, @Body() body: Partial<CandidateProfile>) {
    return this.profile.save(userId, body);
  }

  @Get('sync-token')
  @UseGuards(AuthGuard)
  async token(@CurrentUser() userId: string) {
    return { token: await this.profile.currentSyncToken(userId) };
  }

  /** Rotating immediately invalidates the token the extension is holding. */
  @Post('sync-token')
  @UseGuards(AuthGuard)
  async rotate(@CurrentUser() userId: string) {
    return { token: await this.profile.issueSyncToken(userId) };
  }

  /**
   * The extension's endpoint.
   *
   * Authenticated by bearer token, not by session: the extension runs on a
   * chrome-extension:// origin that the SameSite cookie deliberately cannot
   * reach. Read-only, and it returns only the autofill fields — never skills,
   * achievements or anything else in the fact base.
   */
  @Get('sync')
  sync(@Headers('authorization') authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new UnauthorizedException('Missing sync token.');

    return this.profile.bySyncToken(token);
  }
}
