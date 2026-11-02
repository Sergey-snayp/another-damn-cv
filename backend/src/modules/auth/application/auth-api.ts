import type { AuthApi } from '../contracts';
import type { AccountRepository } from './ports/account-repository';
import type { SignInWithGoogle } from './use-cases/sign-in-with-google';
import type { SyncTokens } from './use-cases/sync-tokens';

export class AuthApplication implements AuthApi {
  constructor(
    private readonly signIn: SignInWithGoogle,
    private readonly accounts: AccountRepository,
    private readonly tokens: SyncTokens,
  ) {}
  signInWithGoogle(credential: string) {
    return this.signIn.execute(credential);
  }
  findById(userId: string) {
    return this.accounts.findById(userId);
  }
  issueSyncToken(userId: string) {
    return this.tokens.issue(userId);
  }
  currentSyncToken(userId: string) {
    return this.tokens.current(userId);
  }
  resolveSyncToken(token: string) {
    return this.tokens.resolve(token);
  }
}
