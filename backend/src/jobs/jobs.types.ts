/** What a posting is, once read. Every field is optional: pages leave things out. */
export interface JobFields {
  title?: string;
  company?: string;
  location?: string;
  remote?: boolean;
  employmentType?: string;
  salary?: string;
  postedAt?: string;
  description?: string;
}

/** Fields a person can edit, and so fields a re-capture must not overwrite once they have. */
export const EDITABLE_FIELDS = [
  'title',
  'company',
  'location',
  'remote',
  'employmentType',
  'salary',
  'description',
] as const satisfies readonly (keyof JobFields)[];

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const CAPTURE_LIMITS = {
  html: 1_500_000,
  text: 200_000,
  jsonLd: 300_000,
} as const;
