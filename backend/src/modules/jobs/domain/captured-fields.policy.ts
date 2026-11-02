import { EDITABLE_FIELDS, type EditableField, type JobFields } from './job';

export type ReadFields = {
  [K in EditableField]?: K extends 'remote' ? boolean | null : string | null;
} & { postedAt?: Date | null };

/** A captured page can replace only fields the user has not edited. */
export function unprotectedFields(fields: JobFields, edited: ReadonlySet<string>): ReadFields {
  const changes: Record<string, string | boolean | Date | null> = {};
  for (const key of EDITABLE_FIELDS) {
    if (!edited.has(key)) changes[key] = fields[key] ?? null;
  }
  changes.postedAt = fields.postedAt ? new Date(fields.postedAt) : null;
  return changes as ReadFields;
}

/** Normalizes captured page spacing without rewriting its words. */
export function normalizeJobText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
