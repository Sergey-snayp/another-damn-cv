/**
 * The application log.
 *
 * `masterCommit` is what lets a resume sent weeks ago be reproduced exactly.
 * `notClaimed` is the interview-prep list for that specific application.
 */

export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  url?: string;
  appliedAt: string;
  /** Commit of the fact base the output was generated from. */
  masterCommit: string;
  summaryVariant?: string;
  claimed: string[];
  notClaimed: string[];
  sentFile?: string;
  status: 'draft' | 'applied' | 'screening' | 'interviewing' | 'rejected' | 'offer';
}
