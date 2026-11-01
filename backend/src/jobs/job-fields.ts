import { EDITABLE_FIELDS, type EditableField, type JobFields } from './jobs.types';

/** Read fields as database columns. */
export type FieldColumns = {
  [K in EditableField]?: K extends 'remote' ? boolean | null : string | null;
} & { postedAt?: Date | null };

/**
 * The fields a read found, as columns, leaving alone the ones the person
 * edited: what you typed always wins over what a page or the model says.
 */
export function fieldColumns(fields: JobFields, edited: ReadonlySet<string>): FieldColumns {
  const columns: Record<string, string | boolean | Date | null> = {};
  for (const key of EDITABLE_FIELDS) {
    if (!edited.has(key)) columns[key] = fields[key] ?? null;
  }
  columns.postedAt = fields.postedAt ? new Date(fields.postedAt) : null;
  return columns as FieldColumns;
}
