import { Logger } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { AuthenticationError } from '../../application/errors';
import type { IdentityVerifier, VerifiedIdentity } from '../../application/ports/identity-verifier';

export class GoogleIdentityVerifier implements IdentityVerifier {
  private readonly logger = new Logger(GoogleIdentityVerifier.name);
  private readonly google: OAuth2Client;
  constructor(private readonly clientId: string) {
    this.google = new OAuth2Client(clientId);
  }

  async verify(credential: string): Promise<VerifiedIdentity> {
    if (!this.clientId) throw new AuthenticationError('GOOGLE_CLIENT_ID is not configured on the server.');
    try {
      const ticket = await this.google.verifyIdToken({ idToken: credential, audience: this.clientId });
      const payload = ticket.getPayload();
      if (!payload) throw new Error('empty payload');
      return {
        subject: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
        name: payload.name,
        picture: payload.picture,
      };
    } catch (error) {
      this.logger.warn(`Rejected Google token: ${(error as Error).message}`);
      throw new AuthenticationError('Invalid Google token.');
    }
  }
}
