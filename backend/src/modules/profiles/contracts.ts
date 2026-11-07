import type { ContactFields, StoredProfile } from './domain/contact';
import type { CareerState } from './domain/career-profile';

export type { CareerFields, ContactFields, StoredProfile } from './domain/contact';
export type { CareerState } from './domain/career-profile';

/** Saved Profile career history, without a CV fallback. */
export interface ProfileCareerApi {
  read(userId: string): Promise<CareerState>;
}

/** Stored profile access is independent of the HTTP view and resume queries. */
export interface ProfileDirectory {
  ensureProfile(userId: string): Promise<StoredProfile>;
}

export interface ProfileApi {
  get(userId: string): Promise<ContactFields>;
  save(userId: string, incoming: Partial<ContactFields>): Promise<ContactFields>;
  bySyncToken(token: string): Promise<ContactFields>;
  contactOnly(userId: string): Promise<ContactFields>;
}
