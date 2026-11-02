import type { CareerFields } from '../../domain/contact';

export interface ProfileCareerReader {
  read(userId: string): Promise<CareerFields>;
}

export interface SyncIdentityReader {
  resolveSyncToken(token: string): Promise<string>;
}
