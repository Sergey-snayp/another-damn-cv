import { Module } from '@nestjs/common';
import { config } from '../../shared/config/config';
import { DatabaseModule } from '../../shared/database/database.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuthApplication } from './application/auth-api';
import { SignInWithGoogle } from './application/use-cases/sign-in-with-google';
import { SyncTokens } from './application/use-cases/sync-tokens';
import { EmbedSessions } from './application/use-cases/embed-sessions';
import { PrismaEmbedSessionStore } from './adapters/outbound/prisma-embed-session.store';
import { GoogleIdentityVerifier } from './adapters/outbound/google-identity.verifier';
import { PrismaAccountRepository } from './adapters/outbound/prisma-account.repository';
import { RandomSyncTokenGenerator } from './adapters/outbound/random-sync-token.generator';
import { AuthController } from './adapters/inbound/http/auth.controller';
import { AuthGuard } from './adapters/inbound/http/auth.guard';
import { SyncTokenGuard } from './adapters/inbound/http/sync-token.guard';
import { AUTH_API, AUTH_SETTINGS } from './auth.tokens';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_SETTINGS, useValue: { googleClientId: config.google.clientId } },
    {
      provide: AUTH_API,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => {
        const accounts = new PrismaAccountRepository(prisma);
        return new AuthApplication(
          new SignInWithGoogle(
            new GoogleIdentityVerifier(config.google.clientId),
            accounts,
            config.allowedEmails,
          ),
          accounts,
          new SyncTokens(accounts, new RandomSyncTokenGenerator()),
          new EmbedSessions(new PrismaEmbedSessionStore(prisma), new RandomSyncTokenGenerator()),
        );
      },
    },
    AuthGuard,
    SyncTokenGuard,
  ],
  exports: [AUTH_API, AUTH_SETTINGS, AuthGuard, SyncTokenGuard],
})
export class AuthModule {}
