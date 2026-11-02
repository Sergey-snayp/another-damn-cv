import type { ProfileDirectory } from '../../contracts';
import { validateCareerImport, type CareerImport } from '../../domain/career-profile';
import type { CareerProfileRepository, CareerSourceReader } from '../ports/career-profile';
export class ImportProfileCareer {
  constructor(
    private readonly directory: ProfileDirectory,
    private readonly repository: CareerProfileRepository,
    private readonly sources: CareerSourceReader,
    private readonly now = () => new Date(),
  ) {}
  async execute(userId: string, input: CareerImport) {
    validateCareerImport(input);
    await this.sources.assertOwned(userId, input.source);
    await this.directory.ensureProfile(userId);
    return this.repository.import(userId, input, this.now().toISOString());
  }
}
