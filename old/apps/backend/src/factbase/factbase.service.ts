import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { FactBase, Skill, Achievement } from '@cv/core';
import { config } from '../config';

/**
 * Owns the single source of truth.
 *
 * Reads are cached but revalidated by mtime, so editing the JSON by hand — which
 * is still the fastest way to fix a fact — takes effect without a restart.
 */
@Injectable()
export class FactBaseService {
  private cache: FactBase | null = null;
  private cachedAt = 0;

  load(): FactBase {
    if (!existsSync(config.factBasePath)) {
      throw new NotFoundException(`Fact base not found at ${config.factBasePath}`);
    }

    const { mtimeMs } = require('node:fs').statSync(config.factBasePath);

    if (!this.cache || mtimeMs > this.cachedAt) {
      this.cache = JSON.parse(readFileSync(config.factBasePath, 'utf8')) as FactBase;
      this.cachedAt = mtimeMs;
    }

    return this.cache;
  }

  save(base: FactBase): void {
    base.meta = { ...base.meta, updatedAt: new Date().toISOString() };
    writeFileSync(config.factBasePath, `${JSON.stringify(base, null, 2)}\n`, 'utf8');
    this.cache = null;
  }

  skills(): Skill[] {
    return this.load().skills;
  }

  achievements(): Achievement[] {
    return this.load().projects.flatMap((project) => project.achievements);
  }

  /** Counts worth showing on a dashboard: how much of the base is actually evidenced. */
  stats() {
    const base = this.load();
    const achievements = this.achievements();

    return {
      skills: base.skills.length,
      skillsVerified: base.skills.filter((s) => s.verified).length,
      projects: base.projects.length,
      achievements: achievements.length,
      achievementsVerified: achievements.filter((a) => a.verified).length,
      updatedAt: base.meta?.updatedAt,
    };
  }
}
