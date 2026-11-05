import type { IdGenerator, ResumeRepository, ResumeTransaction } from '../ports/resume-repository';
import type { RenderedResume, ResumeChanges, VersionedTable } from '../../domain/resume';
import { assemble, differs, toChanges, withoutBookkeeping } from '../../domain/document';
import { assertOwned, currentDocument, rebuildDocument } from './read-resume';
type EntryInput = { lineageId?: string } & Record<string, unknown>;
const ORDERED_TABLES = new Set<VersionedTable>([
  'experienceEntry',
  'achievement',
  'educationEntry',
  'skillEntry',
  'projectEntry',
  'certificationEntry',
  'customSection',
]);
const NATURAL_KEY: Partial<Record<VersionedTable, string>> = { summaryVariant: 'variant' };
export class SaveResume {
  constructor(
    private readonly repository: ResumeRepository,
    private readonly ids: IdGenerator,
  ) {}
  async execute(input: {
    userId: string;
    id: string;
    changes: ResumeChanges;
    message?: string;
  }): Promise<RenderedResume> {
    await assertOwned(this.repository, input.userId, input.id);
    return this.repository.transaction((tx) =>
      this.saveInTransaction(tx, input.id, input.changes, input.message),
    );
  }
  async saveInTransaction(
    tx: ResumeTransaction,
    id: string,
    changes: ResumeChanges,
    message?: string,
  ): Promise<RenderedResume> {
    const number = (await tx.latestSnapshot(id))?.number ?? 0;
    const next = number + 1;
    const sections: Array<[Exclude<VersionedTable, 'contactInformation'>, EntryInput[] | undefined]> = [
      ['experienceEntry', changes.experiences],
      ['achievement', changes.achievements],
      ['educationEntry', changes.educations],
      ['skillEntry', changes.skills],
      ['summaryVariant', changes.summaries],
      ['projectEntry', changes.projects],
      ['certificationEntry', changes.certifications],
      ['customSection', changes.customSections],
    ];
    let touched = changes.contact ? await this.applySingle(tx, id, next, changes.contact) : false;
    for (const [table, entries] of sections)
      if (entries) touched = (await this.applyList(tx, table, id, next, entries)) || touched;
    if (!touched) return currentDocument(tx, id);
    const snapshot = await tx.createSnapshot(id, next, message);
    const rendered = assemble(next, await tx.sections(id));
    await tx.materialise(id, rendered, snapshot.id);
    return rendered;
  }
  private async applySingle(
    tx: ResumeTransaction,
    id: string,
    number: number,
    input: EntryInput,
  ): Promise<boolean> {
    const [existing] = await tx.liveRows(id, 'contactInformation');
    const content = withoutBookkeeping(input);
    if (existing && !differs(existing, content)) return false;
    if (existing) await tx.closeRow('contactInformation', existing.id, number);
    await tx.openRow('contactInformation', {
      ...content,
      lineageId: existing?.lineageId ?? input.lineageId ?? this.ids.next(),
      resumeId: id,
      createdInSnapshot: number,
    });
    return true;
  }
  private async applyList(
    tx: ResumeTransaction,
    table: VersionedTable,
    id: string,
    number: number,
    inputs: EntryInput[],
  ): Promise<boolean> {
    const live = await tx.liveRows(id, table);
    const liveByLineage = new Map(live.map((row) => [row.lineageId, row]));
    const naturalKey = NATURAL_KEY[table];
    const liveByNatural = naturalKey ? new Map(live.map((row) => [String(row[naturalKey]), row])) : null;
    const seen = new Set<string>();
    let touched = false;
    for (const [index, input] of inputs.entries()) {
      const matched = input.lineageId
        ? liveByLineage.get(input.lineageId)
        : naturalKey
          ? liveByNatural?.get(String(input[naturalKey]))
          : undefined;
      const lineageId = matched?.lineageId ?? input.lineageId ?? this.ids.next();
      seen.add(lineageId);
      const existing = matched ?? liveByLineage.get(lineageId);
      const content = withoutBookkeeping(input);
      if (ORDERED_TABLES.has(table)) content.position = input.position ?? index;
      else delete content.position;
      if (existing && !differs(existing, content)) continue;
      if (existing) await tx.closeRow(table, existing.id, number);
      await tx.openRow(table, { ...content, lineageId, resumeId: id, createdInSnapshot: number });
      touched = true;
    }
    for (const [lineageId, row] of liveByLineage) {
      if (seen.has(lineageId)) continue;
      await tx.closeRow(table, row.id, number);
      touched = true;
    }
    return touched;
  }
}
export class RevertResume {
  constructor(
    private readonly repository: ResumeRepository,
    private readonly save: SaveResume,
  ) {}
  async execute(input: { userId: string; id: string; number: number }) {
    await assertOwned(this.repository, input.userId, input.id);
    const document = assemble(input.number, await this.repository.sections(input.id, input.number));
    return this.save.execute({
      userId: input.userId,
      id: input.id,
      changes: toChanges(document),
      message: `revert to snapshot ${input.number}`,
    });
  }
}
export class RebuildResume {
  constructor(private readonly repository: ResumeRepository) {}
  async execute(input: { userId: string; id: string }) {
    await assertOwned(this.repository, input.userId, input.id);
    return rebuildDocument(this.repository, input.id);
  }
}
