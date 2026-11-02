import type { PublicUser } from '../../contracts';

export interface GoogleAccount {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl: string | null;
}

export interface AccountRepository {
  upsertGoogleAccount(account: GoogleAccount): Promise<PublicUser>;
  findById(userId: string): Promise<PublicUser | null>;
  replaceSyncToken(userId: string, token: string): Promise<void>;
  currentSyncToken(userId: string): Promise<string | null>;
  findIdBySyncToken(token: string): Promise<string | null>;
}
