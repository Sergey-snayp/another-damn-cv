import type { ProfileDirectory } from '../../contracts';
import { contactValues } from '../../domain/contact-rules';
import type { ProfileCareerReader } from '../ports/profile-career-reader';

export class GetProfile {
  constructor(
    private readonly directory: ProfileDirectory,
    private readonly career: ProfileCareerReader,
  ) {}
  async execute(userId: string) {
    const profile = await this.directory.ensureProfile(userId);
    return { ...contactValues(profile), ...(await this.career.read(userId)) };
  }
}
