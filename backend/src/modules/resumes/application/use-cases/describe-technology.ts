import type { ResumesApi } from '../../contracts';
import { ResumeError } from '../errors';
import { cleanDescription, linesMentioning, technologyKey } from '../../domain/technology-notes';

/** Explanations already written, per person. */
export interface TechnologyNoteStore {
  find(userId: string, key: string): Promise<{ name: string; description: string } | null>;
  save(userId: string, key: string, name: string, description: string): Promise<void>;
}

/** Writes what a technology is, in a sentence. */
export interface TechnologyDescriber {
  describe(input: { name: string; mentions: string[] }): Promise<string>;
}

/**
 * What a technology on the CV is, for the card shown when pointing at a skill.
 * Written by the AI once per person and technology, then read from the store.
 */
export class DescribeTechnology {
  /** One AI call per technology at a time, however many cards ask for it. */
  private readonly running = new Map<string, Promise<string>>();

  constructor(
    private readonly resumes: Pick<ResumesApi, 'current'>,
    private readonly notes: TechnologyNoteStore,
    private readonly describer: TechnologyDescriber,
  ) {}

  async describe(
    userId: string,
    resumeId: string,
    name: string,
  ): Promise<{ name: string; description: string }> {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) throw new ResumeError('invalid', 'Name a technology.');
    const key = technologyKey(clean);
    const saved = await this.notes.find(userId, key);
    if (saved) return { name: clean, description: saved.description };
    const runKey = `${userId}\n${key}`;
    let run = this.running.get(runKey);
    if (!run) {
      run = this.write(userId, resumeId, clean, key).finally(() => this.running.delete(runKey));
      this.running.set(runKey, run);
    }
    return { name: clean, description: await run };
  }

  private async write(userId: string, resumeId: string, name: string, key: string): Promise<string> {
    const resume = await this.resumes.current(userId, resumeId);
    const description = cleanDescription(
      await this.describer.describe({ name, mentions: linesMentioning(resume, name) }),
    );
    if (!description) throw new ResumeError('invalid', `No description came back for ${name}. Try again.`);
    await this.notes.save(userId, key, name, description);
    return description;
  }
}
