import type { AccountRepository } from '../ports/account-repository';
import type { SyncTokenGenerator } from '../ports/identity-verifier';
import { AuthenticationError } from '../errors';

export class SyncTokens {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly generator: SyncTokenGenerator,
  ) {}

  async issue(userId: string): Promise<string> {
    const token = this.generator.generate();
    await this.accounts.replaceSyncToken(userId, token);
    return token;
  }

  current(userId: string): Promise<string | null> {
    return this.accounts.currentSyncToken(userId);
  }

  async resolve(token: string): Promise<string> {
    const userId = await this.accounts.findIdBySyncToken(token);
    if (!userId) throw new AuthenticationError('Invalid sync token.');
    return userId;
  }
}
