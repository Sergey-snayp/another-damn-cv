import type { ContactFields, ProfileApi } from '../contracts';
import type { SyncIdentityReader } from './ports/profile-career-reader';
import type { GetProfile } from './use-cases/get-profile';
import type { UpdateProfile } from './use-cases/update-profile';

export class ProfilesApplication implements ProfileApi {
  constructor(
    private readonly getProfile: GetProfile,
    private readonly update: UpdateProfile,
    private readonly identities: SyncIdentityReader,
  ) {}
  get(userId: string) {
    return this.getProfile.execute(userId);
  }
  save(userId: string, incoming: Partial<ContactFields>) {
    return this.update.execute(userId, incoming);
  }
  async bySyncToken(token: string) {
    return this.get(await this.identities.resolveSyncToken(token));
  }
  contactOnly(userId: string) {
    return this.get(userId);
  }
}
