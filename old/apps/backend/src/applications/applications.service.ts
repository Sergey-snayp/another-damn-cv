import { Injectable } from '@nestjs/common';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ApplicationRecord } from '@cv/core';
import { config } from '../config';

/**
 * The application log.
 *
 * A flat JSON file on purpose: `git init` in the data directory gives history
 * and diffs for free, and every record can be read without this service running.
 */
@Injectable()
export class ApplicationsService {
  private get file(): string {
    return join(config.dataDir, 'applications.json');
  }

  list(): ApplicationRecord[] {
    if (!existsSync(this.file)) return [];

    try {
      return JSON.parse(readFileSync(this.file, 'utf8')) as ApplicationRecord[];
    } catch {
      return [];
    }
  }

  add(record: Omit<ApplicationRecord, 'id'>): ApplicationRecord {
    const saved: ApplicationRecord = { ...record, id: randomUUID() };
    const all = [saved, ...this.list()];

    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(this.file, `${JSON.stringify(all, null, 2)}\n`, 'utf8');

    return saved;
  }

  update(id: string, patch: Partial<ApplicationRecord>): ApplicationRecord | null {
    const all = this.list();
    const index = all.findIndex((record) => record.id === id);
    if (index === -1) return null;

    const updated = { ...all[index]!, ...patch, id };
    all[index] = updated;

    writeFileSync(this.file, `${JSON.stringify(all, null, 2)}\n`, 'utf8');
    return updated;
  }
}
