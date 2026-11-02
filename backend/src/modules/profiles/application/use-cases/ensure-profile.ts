import type { ProfileDirectory } from '../../contracts';
import type { ProfileIdentityReader, ProfileRepository } from '../ports/profile-repository';

export class EnsureProfile implements ProfileDirectory {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly identities: ProfileIdentityReader,
  ) {}

  async ensureProfile(userId: string) {
    const stored = await this.profiles.findByUserId(userId);
    if (stored) return stored;
    const identity = await this.identities.find(userId);
    const [firstName = '', ...rest] = (identity.name ?? '').split(' ');
    return this.profiles.create(userId, { firstName, lastName: rest.join(' '), email: identity.email });
  }
}
