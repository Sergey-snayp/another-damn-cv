import type { ProfileDirectory } from '../../contracts';
import type { CareerProfileRepository } from '../ports/career-profile';
export class GetProfileCareer {
  constructor(
    private readonly directory: ProfileDirectory,
    private readonly repository: CareerProfileRepository,
  ) {}
  async execute(userId: string) {
    await this.directory.ensureProfile(userId);
    return this.repository.read(userId);
  }
}
