import { emptyPreparation, type PreparationInput } from '../../domain/preparation';
import type { PreparationJobReader, PreparationRepository } from '../ports/preparation';
export class GetPreparation {
  constructor(
    private readonly jobs: PreparationJobReader,
    private readonly preparations: PreparationRepository,
  ) {}
  async execute(userId: string, jobId: string) {
    await this.jobs.assertOwned(userId, jobId);
    return (await this.preparations.read(userId, jobId)) ?? emptyPreparation(jobId);
  }
}
export class SavePreparation {
  constructor(
    private readonly jobs: PreparationJobReader,
    private readonly preparations: PreparationRepository,
  ) {}
  async execute(userId: string, jobId: string, input: PreparationInput) {
    await this.jobs.assertOwned(userId, jobId);
    return this.preparations.save(userId, jobId, input);
  }
}
