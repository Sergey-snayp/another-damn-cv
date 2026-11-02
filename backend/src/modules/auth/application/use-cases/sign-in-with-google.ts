import type { PublicUser } from '../../contracts';
import type { AccountRepository } from '../ports/account-repository';
import type { IdentityVerifier } from '../ports/identity-verifier';
import { AuthenticationError } from '../errors';

export class SignInWithGoogle {
  constructor(
    private readonly identities: IdentityVerifier,
    private readonly accounts: AccountRepository,
  ) {}

  async execute(credential: string): Promise<PublicUser> {
    const identity = await this.identities.verify(credential);
    if (!identity.email || identity.emailVerified === false) {
      throw new AuthenticationError('Google account has no verified email.');
    }
    return this.accounts.upsertGoogleAccount({
      googleId: identity.subject,
      email: identity.email,
      name: identity.name,
      avatarUrl: identity.picture ?? null,
    });
  }
}
