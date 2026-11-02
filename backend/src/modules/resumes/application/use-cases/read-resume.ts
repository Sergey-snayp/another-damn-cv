import type { ResumeRepository, ResumeTransaction } from '../ports/resume-repository';
import { ResumeError } from '../errors';
import { assemble } from '../../domain/document';
import type { RenderedResume, VersionedTable } from '../../domain/resume';
import { snapshotDiff } from '../../domain/diff';
export async function assertOwned(repository: ResumeRepository, userId: string, id: string): Promise<void> {
  if (!(await repository.findOwned(userId, id))) throw new ResumeError('not-found', 'No such resume.');
}
export async function rebuildDocument(repository: ResumeTransaction, id: string): Promise<RenderedResume> {
  if (!(await repository.find(id))) throw new ResumeError('not-found', 'No such resume.');
  const latest = await repository.latestSnapshot(id);
  const rendered = assemble(latest?.number ?? 0, await repository.sections(id));
  await repository.materialise(id, rendered, latest?.id ?? null);
  return rendered;
}
export async function currentDocument(repository: ResumeTransaction, id: string): Promise<RenderedResume> {
  const resume = await repository.find(id);
  if (!resume) throw new ResumeError('not-found', 'No such resume.');
  if (resume.current && resume.materialisedAt) return resume.current as RenderedResume;
  return rebuildDocument(repository, id);
}
export class GetResume {
  constructor(private readonly repository: ResumeRepository) {}
  async execute(input: { userId: string; id: string }) {
    await assertOwned(this.repository, input.userId, input.id);
    return currentDocument(this.repository, input.id);
  }
}
export class GetResumeSnapshot {
  constructor(private readonly repository: ResumeRepository) {}
  async execute(input: { userId: string; id: string; number: number }) {
    await assertOwned(this.repository, input.userId, input.id);
    return assemble(input.number, await this.repository.sections(input.id, input.number));
  }
}
export class GetResumeHistory {
  constructor(private readonly repository: ResumeRepository) {}
  async execute(input: { userId: string; id: string; table: VersionedTable; lineageId: string }) {
    await assertOwned(this.repository, input.userId, input.id);
    return this.repository.history(input.id, input.table, input.lineageId);
  }
}
export class GetResumeSnapshots {
  constructor(private readonly repository: ResumeRepository) {}
  async execute(input: { userId: string; id: string }) {
    await assertOwned(this.repository, input.userId, input.id);
    return this.repository.snapshots(input.id);
  }
}
export class GetResumeDiff {
  constructor(private readonly repository: ResumeRepository) {}
  async execute(input: { userId: string; id: string; number: number }) {
    await assertOwned(this.repository, input.userId, input.id);
    return snapshotDiff(
      input.number,
      await this.repository.snapshot(input.id, input.number),
      await this.repository.changesAt(input.id, input.number),
    );
  }
}
