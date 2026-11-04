import type { AutofillDefault, NewDefault } from '../../domain/defaults';

export interface DefaultRepository {
  list(userId: string): Promise<AutofillDefault[]>;
  /** Insert or replace by kind and scope, in one transaction. */
  upsertMany(userId: string, items: (NewDefault & { scopeKey: string })[]): Promise<AutofillDefault[]>;
  update(userId: string, id: string, value: string): Promise<AutofillDefault | null>;
  remove(userId: string, id: string): Promise<boolean>;
}
