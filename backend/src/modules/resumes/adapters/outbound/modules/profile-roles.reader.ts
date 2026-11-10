import type { ProfileCareerApi } from '../../../../profiles/contracts';
import type { ProfileRolesReader } from '../../../application/ports/role-bullets';

/**
 * The Profile's jobs with all their achievements and stars, through the profiles
 * contract. Bullets are the Profile's record; older saved notes are not used.
 */
export class PublicProfileRolesReader implements ProfileRolesReader {
  constructor(private readonly profiles: ProfileCareerApi) {}
  async roles(userId: string) {
    const state = await this.profiles.read(userId);
    return (state.data.experiences?.value ?? []).map((role) => ({
      company: role.company,
      title: role.title,
      from: role.from,
      client: role.client,
      description: role.description,
      techStack: role.techStack,
      bullets: role.bullets,
      starred: role.starred ?? [],
    }));
  }
}
