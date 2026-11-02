import type { CareerImport, CareerSource, CareerState } from '../../domain/career-profile';
export interface CareerProfileRepository {
  read(userId: string): Promise<CareerState>;
  import(userId: string, input: CareerImport, importedAt: string): Promise<CareerState>;
}
export interface CareerSourceReader {
  assertOwned(userId: string, source: CareerSource): Promise<void>;
}
