import type { ProfileCareerApi } from '../../../../profiles/contracts';
import type { ProfileRolesReader } from '../../../application/ports/role-bullets';

/** The Profile's jobs with all their achievements and stars, through the profiles contract. */
export class PublicProfileRolesReader implements ProfileRolesReader {
  constructor(private readonly profiles: ProfileCareerApi) {}
  async roles(userId: string) {
    const state = await this.profiles.read(userId);
    return (state.data.experiences?.value ?? []).map((role) => ({
      company: role.company,
      title: role.title,
      from: role.from,
      bullets: role.bullets,
      starred: role.starred ?? [],
    }));
  }
}
