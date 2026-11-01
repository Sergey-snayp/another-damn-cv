import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * What changed in one snapshot.
 *
 * No text comparison is needed to classify a change: every row records the
 * snapshot it appeared in and the one that replaced it, so the schema already
 * knows whether something was added, reworded or removed. Only the field-level
 * detail of a reword requires comparing values.
 */

export type ChangeKind = 'added' | 'changed' | 'removed';

export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface Change {
  section: string;
  /** The table it came from, so a client can match it to what it renders. */
  table: string;
  lineageId: string;
  kind: ChangeKind;
  /** How to name this row to a person. */
  label: string;
  fields: FieldChange[];
  /**
   * The row as it was. Carried so the document can show a removed entry as a
   * ghost and diff a reworded one word by word — neither is reconstructable
   * from the live rows, because they are not there any more.
   */
  before: Record<string, unknown> | null;
}

export interface SnapshotDiff {
  number: number;
  message: string | null;
  createdAt: Date | null;
  changes: Change[];
  counts: Record<ChangeKind, number>;
}

/** Columns that describe the row rather than its content. */
const BOOKKEEPING = new Set([
  'id',
  'lineageId',
  'resumeId',
  'createdInSnapshot',
  'supersededInSnapshot',
  'experienceLineageId',
]);

const SECTIONS = [
  { table: 'contactInformation', name: 'Contact', label: (r: Row) => `${r.firstName} ${r.lastName}` },
  { table: 'experienceEntry', name: 'Experience', label: (r: Row) => `${r.company} — ${r.title}` },
  { table: 'achievement', name: 'Bullet', label: (r: Row) => String(r.bullet ?? '').slice(0, 60) },
  { table: 'educationEntry', name: 'Education', label: (r: Row) => `${r.institution} — ${r.degree}` },
  { table: 'skillEntry', name: 'Skill', label: (r: Row) => String(r.name ?? '') },
  { table: 'summaryVariant', name: 'Summary', label: (r: Row) => String(r.variant ?? '') },
] as const;

type Row = Record<string, unknown>;

@Injectable()
export class DiffService {
  constructor(private readonly prisma: PrismaService) {}

  async diff(resumeId: string, number: number): Promise<SnapshotDiff> {
    const snapshot = await this.prisma.snapshot.findFirst({ where: { resumeId, number } });
    const changes: Change[] = [];

    for (const section of SECTIONS) {
      const client = this.prisma[section.table] as never as {
        findMany(args: unknown): Promise<Row[]>;
      };

      // Opened in this snapshot: either new, or the successor of something closed.
      const opened = await client.findMany({ where: { resumeId, createdInSnapshot: number } });
      // Closed in this snapshot: either replaced, or removed outright.
      const closed = await client.findMany({ where: { resumeId, supersededInSnapshot: number } });

      const closedByLineage = new Map(closed.map((row) => [row.lineageId as string, row]));
      const openedByLineage = new Map(opened.map((row) => [row.lineageId as string, row]));

      for (const row of opened) {
        const previous = closedByLineage.get(row.lineageId as string);

        changes.push({
          section: section.name,
          table: section.table,
          lineageId: row.lineageId as string,
          kind: previous ? 'changed' : 'added',
          label: section.label(previous ?? row),
          fields: previous ? this.fieldChanges(previous, row) : [],
          before: previous ?? null,
        });
      }

      // Closed with no successor is a deletion.
      for (const row of closed) {
        if (openedByLineage.has(row.lineageId as string)) continue;

        changes.push({
          section: section.name,
          table: section.table,
          lineageId: row.lineageId as string,
          kind: 'removed',
          label: section.label(row),
          fields: [],
          before: row,
        });
      }
    }

    return {
      number,
      message: snapshot?.message ?? null,
      createdAt: snapshot?.createdAt ?? null,
      changes,
      counts: {
        added: changes.filter((c) => c.kind === 'added').length,
        changed: changes.filter((c) => c.kind === 'changed').length,
        removed: changes.filter((c) => c.kind === 'removed').length,
      },
    };
  }

  /** Only fields that actually moved, and only content fields. */
  private fieldChanges(before: Row, after: Row): FieldChange[] {
    const fields: FieldChange[] = [];

    for (const key of Object.keys(after)) {
      if (BOOKKEEPING.has(key)) continue;

      const a = before[key];
      const b = after[key];

      if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;

      fields.push({
        field: key,
        before: a == null ? null : String(a),
        after: b == null ? null : String(b),
      });
    }

    return fields;
  }
}
