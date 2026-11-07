import type { ProfileDirectory } from '../../contracts';
import type { CareerSections } from '../../domain/career-profile';
import type { CareerProfileRepository } from '../ports/career-profile';

/** Edits the career history in Profile; no CV or PDF is involved. */
export class SaveProfileCareer {
  constructor(
    private readonly directory: ProfileDirectory,
    private readonly repository: CareerProfileRepository,
    private readonly now = () => new Date(),
  ) {}

  async execute(userId: string, input: { expectedRevision: number; sections: Partial<CareerSections> }) {
    await this.directory.ensureProfile(userId);
    return this.repository.import(
      userId,
      {
        ...input,
        source: { kind: 'profile' },
        contact: {},
        expectedContact: {},
      },
      this.now().toISOString(),
    );
  }
}
