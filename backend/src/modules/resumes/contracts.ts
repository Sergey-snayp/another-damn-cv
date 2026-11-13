import type {
  CareerFields,
  JobForCopy,
  RenderedResume,
  ResumeChanges,
  ResumeRecord,
  ResumeSummary,
  Snapshot,
  VersionedRow,
  VersionedTable,
} from './domain/resume';
import type { SnapshotDiff } from './domain/diff';
import type { Tailoring } from './domain/tailoring/types';
import type { QuickTailoringDraft, QuickTailoringSave } from './application/use-cases/quick-tailoring';
export type { QuickTailoringDraft, QuickTailoringSave } from './application/use-cases/quick-tailoring';

export type {
  CareerFields,
  JobForCopy,
  RenderedResume,
  ResumeChanges,
  ResumeRecord,
  ResumeSummary,
  Snapshot,
  VersionedRow,
  VersionedTable,
} from './domain/resume';
export type { SnapshotDiff } from './domain/diff';
export type { Tailoring } from './domain/tailoring/types';
export type {
  ImportProposal,
  ImportedProfile,
  ImportedExperience,
  ImportedEducation,
} from './domain/import-proposal';
export { ResumeError } from './application/errors';
export interface ResumesApi {
  assertOwned(userId: string, id: string): Promise<void>;
  list(userId: string): Promise<ResumeSummary[]>;
  create(userId: string, name: string, targetRole?: string): Promise<ResumeRecord>;
  /** Deletes the CV with its versions and PDF. Jobs applied with it keep the job, without the CV. */
  remove(userId: string, id: string): Promise<void>;
  /** Makes this CV the default: the master others are tailored from, offered first on a new job. */
  makeDefault(userId: string, id: string): Promise<void>;
  current(userId: string, id: string): Promise<RenderedResume>;
  atSnapshot(userId: string, id: string, number: number): Promise<RenderedResume>;
  history(userId: string, id: string, table: VersionedTable, lineageId: string): Promise<VersionedRow[]>;
  snapshots(userId: string, id: string): Promise<Snapshot[]>;
  diff(userId: string, id: string, number: number): Promise<SnapshotDiff>;
  save(userId: string, id: string, changes: ResumeChanges, message?: string): Promise<RenderedResume>;
  revertTo(userId: string, id: string, number: number): Promise<RenderedResume>;
  rebuild(userId: string, id: string): Promise<RenderedResume>;
  career(userId: string): Promise<CareerFields>;
  latestIdsForJobs(userId: string, jobIds: readonly string[]): Promise<Record<string, string>>;
  workspaceForJob(
    userId: string,
    job: JobForCopy,
    sourceResumeId?: string,
  ): Promise<{ id: string; document: RenderedResume }>;
  previewQuickTailoring(
    userId: string,
    job: JobForCopy,
    sourceResumeId?: string,
  ): Promise<QuickTailoringDraft>;
  saveQuickTailoring(
    userId: string,
    job: JobForCopy,
    input: QuickTailoringSave,
  ): Promise<QuickTailoringDraft>;
  pending(userId: string, id: string): Promise<unknown>;
  storeProposal(userId: string, id: string, proposal: unknown): Promise<void>;
  discardProposal(userId: string, id: string): Promise<void>;
}
export interface TailoringApi {
  previewQuickTailoring(userId: string, jobId: string, sourceResumeId?: string): Promise<QuickTailoringDraft>;
  saveQuickTailoring(userId: string, jobId: string, input: QuickTailoringSave): Promise<QuickTailoringDraft>;
  tailorForJob(
    userId: string,
    jobId: string,
    sourceResumeId?: string,
  ): Promise<{ resumeId: string; tailoring: Tailoring }>;
  pending(userId: string, resumeId: string): Promise<{ tailoring: Tailoring | null }>;
  discard(userId: string, resumeId: string): Promise<void>;
  /** This job's copy of a CV, made now if there is none yet. No AI runs. */
  copyForJob(userId: string, jobId: string, sourceResumeId?: string): Promise<{ resumeId: string }>;
}

/** Formatting marks in text (**bold**, *italic*, ++underline++, [links](…)): the words alone. */
export { withoutMarks } from './domain/text-marks';
/** How CV lines are written for recruiters and search filters, for any module that writes them. */
export {
  BULLET_RULES,
  RECRUITER_RULES,
  DASH_PUNCTUATION_RULE,
  withoutAddedPurpose,
  withoutDashPunctuation,
} from './domain/cv-writing-guide';
