import type { ContactFields, ProfileDirectory } from '../../contracts';
import { storedContactChanges } from '../../domain/contact-rules';
import type { ProfileRepository } from '../ports/profile-repository';
import type { GetProfile } from './get-profile';

export class UpdateProfile {
  constructor(
    private readonly directory: ProfileDirectory,
    private readonly profiles: ProfileRepository,
    private readonly getProfile: GetProfile,
  ) {}
  async execute(userId: string, incoming: Partial<ContactFields>) {
    await this.directory.ensureProfile(userId);
    await this.profiles.update(userId, storedContactChanges(incoming));
    return this.getProfile.execute(userId);
  }
}
