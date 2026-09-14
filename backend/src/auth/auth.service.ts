import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { config } from '../config';

/**
 * Google sign-in, ID-token flow.
 *
 * The browser gets a signed JWT from Google and posts it here. Everything then
 * depends on verifying it properly:
 *
 *   - signature, against Google's published keys
 *   - `aud`, which must be OUR client id — a token minted for any other Google
 *     app would otherwise be accepted and log a stranger in
 *   - `exp`, so old tokens die
 *
 * verifyIdToken() performs all three. Never decode a JWT and trust its contents.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly google = new OAuth2Client(config.google.clientId);

  constructor(private readonly prisma: PrismaService) {}

  async signInWithGoogle(idToken: string): Promise<User> {
    if (!config.google.clientId) {
      throw new UnauthorizedException('GOOGLE_CLIENT_ID is not configured on the server.');
    }

    const payload = await this.verify(idToken);

    // Read identity ONLY from the verified payload. Anything the client sent
    // alongside the token is unverified and must be ignored.
    const googleId = payload.sub;
    const email = payload.email;

    if (!email || payload.email_verified === false) {
      throw new UnauthorizedException('Google account has no verified email.');
    }

    return this.upsertUser(googleId, email, payload);
  }

  private async verify(idToken: string): Promise<TokenPayload> {
    try {
      const ticket = await this.google.verifyIdToken({
        idToken,
        audience: config.google.clientId,
      });

      const payload = ticket.getPayload();
      if (!payload) throw new Error('empty payload');

      return payload;
    } catch (err) {
      this.logger.warn(`Rejected Google token: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid Google token.');
    }
  }

  /**
   * Matched on `sub`, Google's stable user id — not on email, which people
   * change. The email is updated on every sign-in so it stays current.
   */
  private upsertUser(googleId: string, email: string, payload: TokenPayload): Promise<User> {
    return this.prisma.user.upsert({
      where: { googleId },
      create: {
        googleId,
        email,
        name: payload.name ?? email.split('@')[0]!,
        avatarUrl: payload.picture ?? null,
      },
      update: {
        email,
        name: payload.name ?? undefined,
        avatarUrl: payload.picture ?? null,
      },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
