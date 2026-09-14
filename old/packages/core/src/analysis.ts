/**
 * Matching a posting against the fact base.
 *
 * The important output is `missing`. A score is a vanity metric; the list of
 * things that could not be supported is what the candidate acts on, and what
 * keeps the system from quietly inventing coverage.
 */

export interface ConceptMatch {
  concept: string;
  /** How central the posting makes it. */
  importance: number;
}

export interface Coverage {
  /** Backed by a fact with evidence. */
  evidenced: ConceptMatch[];
  /** Present in the base but self-reported. Counts for less. */
  selfReported: ConceptMatch[];
  /** Not in the base at all. Never claim these. */
  missing: ConceptMatch[];
}

export interface JobPosting {
  company: string;
  title: string;
  location?: string;
  url?: string;
  description: string;
}

export type OutputKind = 'resume' | 'coverLetter' | 'interviewBrief';

export interface TailorRequest {
  posting: JobPosting;
  kind: OutputKind;
  /** Named summary variant, e.g. "highload". */
  summaryVariant?: string;
}

export interface TailorResult {
  markdown: string;
  coverage: Coverage;
  /** Achievement ids that made the cut, in order. */
  used: string[];
}
