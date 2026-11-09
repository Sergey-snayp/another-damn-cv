import type { ChooserAnswer, PoolItem, ProfileRole } from '../../domain/role-bullets';

/** The jobs saved in the person's Profile, with every achievement. */
export interface ProfileRolesReader {
  roles(userId: string): Promise<ProfileRole[]>;
}

/** Chooses and rewords a job's bullets for one posting. */
export interface BulletChooser {
  choose(input: {
    job: string;
    items: (PoolItem & { hint: string })[];
    count: number;
    instruction?: string;
  }): Promise<ChooserAnswer>;
}
