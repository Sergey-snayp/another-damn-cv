import type { PublicUser } from '../../contracts';
import type { AccountRepository } from '../ports/account-repository';
import type { IdentityVerifier } from '../ports/identity-verifier';
import { AuthenticationError } from '../errors';

export class SignInWithGoogle {
  /**
   * `allowedEmails`: when not empty, only these people may sign in (a test
   * server that is not open to everyone yet). Empty lets anyone in.
   */
  constructor(
    private readonly identities: IdentityVerifier,
    private readonly accounts: AccountRepository,
    private readonly allowedEmails: readonly string[] = [],
  ) {}

  async execute(credential: string): Promise<PublicUser> {
    const identity = await this.identities.verify(credential);
    if (!identity.email || identity.emailVerified === false) {
      throw new AuthenticationError('Google account has no verified email.');
    }
    const allowed = this.allowedEmails.map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes(identity.email.trim().toLowerCase())) {
      throw new AuthenticationError(
        `This server is invite-only for now. Ask its owner to add ${identity.email}.`,
      );
    }
    return this.accounts.upsertGoogleAccount({
      googleId: identity.subject,
      email: identity.email,
      name: identity.name,
      avatarUrl: identity.picture ?? null,
    });
  }
}
