import type { StoredContactKey, StoredProfile } from '../../domain/contact';

export interface ProfileRepository {
  findByUserId(userId: string): Promise<StoredProfile | null>;
  create(
    userId: string,
    seed: { firstName: string; lastName: string; email: string },
  ): Promise<StoredProfile>;
  update(userId: string, values: Partial<Record<StoredContactKey, string>>): Promise<void>;
}

export interface ProfileIdentityReader {
  find(userId: string): Promise<{ name: string; email: string }>;
}
