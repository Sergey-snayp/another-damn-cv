import type { DefaultRepository } from '../ports/defaults';
import { cleanDefaults, DefaultNotFoundError, type NewDefault } from '../../domain/defaults';

export class ListDefaults {
  constructor(private readonly repository: DefaultRepository) {}
  execute(userId: string) {
    return this.repository.list(userId);
  }
}

/** Saves defaults chosen on a form, or moved from the browser. Same kind and scope replaces. */
export class SaveDefaults {
  constructor(private readonly repository: DefaultRepository) {}
  execute(userId: string, items: NewDefault[]) {
    return this.repository.upsertMany(userId, cleanDefaults(items));
  }
}

export class UpdateDefault {
  constructor(private readonly repository: DefaultRepository) {}
  async execute(userId: string, id: string, value: string) {
    const updated = await this.repository.update(userId, id, value.trim());
    if (!updated) throw new DefaultNotFoundError();
    return updated;
  }
}

export class DeleteDefault {
  constructor(private readonly repository: DefaultRepository) {}
  async execute(userId: string, id: string) {
    if (!(await this.repository.remove(userId, id))) throw new DefaultNotFoundError();
  }
}
