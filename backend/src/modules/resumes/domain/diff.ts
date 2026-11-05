import type { Snapshot, VersionedRow, VersionedTable } from './resume';
export type ChangeKind = 'added' | 'changed' | 'removed';
export interface FieldChange {
  field: string;
  before: string | null;
  after: string | null;
}
export interface Change {
  section: string;
  table: string;
  lineageId: string;
  kind: ChangeKind;
  label: string;
  fields: FieldChange[];
  before: VersionedRow | null;
}
export interface SnapshotDiff {
  number: number;
  message: string | null;
  createdAt: Date | null;
  changes: Change[];
  counts: Record<ChangeKind, number>;
}
const BOOKKEEPING = new Set([
  'id',
  'lineageId',
  'resumeId',
  'createdInSnapshot',
  'supersededInSnapshot',
  'experienceLineageId',
]);
const SECTIONS: Array<{ table: VersionedTable; name: string; label: (row: VersionedRow) => string }> = [
  {
    table: 'contactInformation',
    name: 'Contact',
    label: (r) => `${display(r.firstName)} ${display(r.lastName)}`,
  },
  {
    table: 'experienceEntry',
    name: 'Experience',
    label: (r) => `${display(r.company)} — ${display(r.title)}`,
  },
  { table: 'achievement', name: 'Bullet', label: (r) => display(r.bullet).slice(0, 60) },
  {
    table: 'educationEntry',
    name: 'Education',
    label: (r) => `${display(r.institution)} — ${display(r.degree)}`,
  },
  { table: 'skillEntry', name: 'Skill', label: (r) => display(r.name) },
  { table: 'summaryVariant', name: 'Summary', label: (r) => display(r.variant) },
  { table: 'projectEntry', name: 'Project', label: (r) => display(r.name) },
  {
    table: 'certificationEntry',
    name: 'Certification',
    label: (r) => [display(r.name), display(r.issuer)].filter(Boolean).join(' — '),
  },
  { table: 'customSection', name: 'Section', label: (r) => display(r.title) },
];
function display(value: unknown): string {
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return '';
}
function fieldChanges(before: VersionedRow, after: VersionedRow): FieldChange[] {
  const fields: FieldChange[] = [];
  for (const key of Object.keys(after)) {
    if (BOOKKEEPING.has(key)) continue;
    const a = before[key],
      b = after[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    fields.push({
      field: key,
      before: a === null || a === undefined ? null : display(a),
      after: b === null || b === undefined ? null : display(b),
    });
  }
  return fields;
}
export function snapshotDiff(
  number: number,
  snapshot: Snapshot | null,
  sections: Array<{ table: VersionedTable; opened: VersionedRow[]; closed: VersionedRow[] }>,
): SnapshotDiff {
  const changes: Change[] = [];
  for (const section of SECTIONS) {
    const { opened, closed } = sections.find((rows) => rows.table === section.table) ?? {
      opened: [],
      closed: [],
    };
    const closedByLineage = new Map(closed.map((row) => [row.lineageId, row]));
    const openedByLineage = new Map(opened.map((row) => [row.lineageId, row]));
    for (const row of opened) {
      const previous = closedByLineage.get(row.lineageId);
      changes.push({
        section: section.name,
        table: section.table,
        lineageId: row.lineageId,
        kind: previous ? 'changed' : 'added',
        label: section.label(previous ?? row),
        fields: previous ? fieldChanges(previous, row) : [],
        before: previous ?? null,
      });
    }
    for (const row of closed) {
      if (openedByLineage.has(row.lineageId)) continue;
      changes.push({
        section: section.name,
        table: section.table,
        lineageId: row.lineageId,
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
