import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Patch,
  Post,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { AUTH_API } from '../../../../auth/auth.tokens';
import type { AuthApi } from '../../../../auth/contracts';
import {
  AuthenticationErrorFilter,
  AuthGuard,
  CurrentUser,
  SyncTokenGuard,
  syncToken,
} from '../../../../auth/http';
import type { ContactFields, ProfileApi } from '../../../contracts';
import { PROFILE_API } from '../../../profiles.tokens';

@Controller('profile')
@UseFilters(AuthenticationErrorFilter)
export class ProfilesController {
  constructor(
    @Inject(PROFILE_API) private readonly profiles: ProfileApi,
    @Inject(AUTH_API) private readonly auth: AuthApi,
  ) {}
  @Get()
  @UseGuards(AuthGuard)
  get(@CurrentUser() userId: string) {
    return this.profiles.get(userId);
  }
  @Put()
  @UseGuards(AuthGuard)
  save(@CurrentUser() userId: string, @Body() body: Partial<ContactFields>) {
    return this.profiles.save(userId, body);
  }
  @Get('sync-token')
  @UseGuards(AuthGuard)
  async token(@CurrentUser() userId: string) {
    return { token: await this.auth.currentSyncToken(userId) };
  }
  @Post('sync-token')
  @UseGuards(AuthGuard)
  async rotate(@CurrentUser() userId: string) {
    return { token: await this.auth.issueSyncToken(userId) };
  }
  @Get('sync')
  sync(@Headers('authorization') authorization?: string) {
    return this.profiles.bySyncToken(syncToken(authorization));
  }
}

/**
 * Profile values the extension may set when a form asks for one the profile
 * lacks, from the field's icon. Name and email stay in the app.
 */
export const EXTENSION_PROFILE_KEYS = [
  'preferredName',
  'phone',
  'location',
  'city',
  'state',
  'country',
  'postalCode',
  'linkedin',
  'github',
  'portfolio',
  'website',
  'telegram',
  'workAuthorization',
  'requiresSponsorship',
  'salaryExpectation',
  'noticePeriod',
  'workArrangements',
] as const;
export const extensionProfileSchema = z
  .object(
    Object.fromEntries(
      EXTENSION_PROFILE_KEYS.map((key) => [key, z.string().trim().min(1).max(500).optional()]),
    ),
  )
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Send at least one value.');

@Controller('extension/profile')
@UseGuards(SyncTokenGuard)
export class ExtensionProfileController {
  constructor(@Inject(PROFILE_API) private readonly profiles: ProfileApi) {}
  @Patch()
  save(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(extensionProfileSchema)) body: Partial<ContactFields>,
  ) {
    return this.profiles.save(userId, body);
  }
}
