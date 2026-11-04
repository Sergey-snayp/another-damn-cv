import type { CareerImport, CareerSections, CareerSource, CareerState } from '../../domain/career-profile';
export interface CareerProfileRepository {
  read(userId: string): Promise<CareerState>;
  import(userId: string, input: CareerImport, importedAt: string): Promise<CareerState>;
}
export interface CareerSourceReader {
  assertOwned(userId: string, source: CareerSource): Promise<void>;
}
/** One CV's content as career sections. Throws for a CV the user does not own. */
export interface ResumeSectionsReader {
  read(userId: string, resumeId: string): Promise<CareerSections>;
}
