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
  pending(userId: string, id: string): Promise<unknown>;
  storeProposal(userId: string, id: string, proposal: unknown): Promise<void>;
  discardProposal(userId: string, id: string): Promise<void>;
}
export interface TailoringApi {
  tailorForJob(
    userId: string,
    jobId: string,
    sourceResumeId?: string,
  ): Promise<{ resumeId: string; tailoring: Tailoring }>;
  pending(userId: string, resumeId: string): Promise<{ tailoring: Tailoring | null }>;
  discard(userId: string, resumeId: string): Promise<void>;
}
