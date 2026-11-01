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
  'title', 'company', 'location', 'remote', 'employmentType', 'salary', 'description',
] as const satisfies readonly (keyof JobFields)[];

export type EditableField = (typeof EDITABLE_FIELDS)[number];

/** What the extension sends when you press "Send this job to the app". */
export interface CaptureRequest {
  url: string;
  pageTitle?: string;
  /** The job's part of the page, with scripts, styles, images and forms removed. */
  html?: string;
  /** The same part as the browser renders it — the best text we can get. */
  text?: string;
  /** Every parsed JSON-LD block on the page; the job may be any of them. */
  jsonLd?: unknown[];
}

export const CAPTURE_LIMITS = {
  html: 1_500_000,
  text: 200_000,
  jsonLd: 300_000,
} as const;
