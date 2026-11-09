import type { ChooserAnswer, PoolItem, ProfileRole, CvRole } from '../../domain/role-bullets';

/** The jobs saved in the person's Profile, with every achievement. */
export interface ProfileRolesReader {
  roles(userId: string): Promise<ProfileRole[]>;
}
export interface SavedCvRolesReader {
  roles(userId: string): Promise<CvRole[]>;
}

/** Chooses and rewords a job's bullets for one posting. */
export interface BulletChooser {
  choose(input: {
    job: string;
    items: (PoolItem & { hint: string })[];
    /** At most this many; with `min` below it, the posting decides how many. */
    count: number;
    min?: number;
    instruction?: string;
  }): Promise<ChooserAnswer>;
}
