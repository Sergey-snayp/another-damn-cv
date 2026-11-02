/** What tailoring stores on the resume copy and shows for review. */

export interface BulletSuggestion {
  lineageId: string;
  experienceLineageId: string;
  before: string;
  /** Equal to `before` when the model left it alone or its rewrite was blocked. */
  after: string;
  /** False: suggested for hiding on this copy. */
  keep: boolean;
  /** Why it should be hidden. */
  reason: string | null;
  /** Why the model's rewrite was thrown away, if it was. */
  blocked: string | null;
  /** The rewrite that was thrown away, and the words that sank it. */
  rejected?: string | null;
  problems?: string[];
  /** Position within its role, before and after reordering. */
  from: number;
  to: number;
}

export interface SummarySuggestion {
  before: string;
  after: string;
  blocked: string | null;
  rejected?: string | null;
  problems?: string[];
}

export interface Tailoring {
  jobId: string;
  jobTitle: string;
  company: string | null;
  /** The resume snapshot these suggestions were made against. */
  basedOnSnapshot: number;
  createdAt: string;
  summaryVariant: string;
  summary: SummarySuggestion;
  bullets: BulletSuggestion[];
  /** Every skill's lineageId, most relevant first. */
  skills: string[];
  /** What the posting asks for that the resume does not contain. */
  cannotClaim: string[];
}

/** Suggestions before they are tied to a job and a time. */
export type TailoringDraft = Omit<Tailoring, 'jobId' | 'jobTitle' | 'company' | 'createdAt'>;

export interface JobForTailoring {
  id: string;
  title: string | null;
  company: string | null;
  description: string;
}
