import { careerFields } from '../../domain/career-profile';
import type { CareerProfileRepository } from '../ports/career-profile';
import type { ProfileCareerReader } from '../ports/profile-career-reader';
export class GetCareerFields implements ProfileCareerReader {
  constructor(
    private readonly repository: CareerProfileRepository,
    private readonly fallback: ProfileCareerReader,
    private readonly year = () => new Date().getFullYear(),
  ) {}
  async read(userId: string) {
    const state = await this.repository.read(userId);
    return state.data.experiences
      ? careerFields(state.data.experiences.value, this.year())
      : this.fallback.read(userId);
  }
}
