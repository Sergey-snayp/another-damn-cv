import type {
  CareerFields,
  Experience,
  JobForCopy,
  RenderedResume,
  ResumeRecord,
  ResumeSummary,
  SectionRows,
  Snapshot,
  VersionedRow,
  VersionedTable,
} from '../../domain/resume';

export interface CreateResumeRecord {
  profileId: string;
  name: string;
  targetRole?: string | null;
  jobId?: string;
  sourceResumeId?: string;
  /** The design, so a job's copy looks like the CV it was made from. */
  theme?: unknown;
}
export interface SectionChangeRows {
  table: VersionedTable;
  opened: VersionedRow[];
  closed: VersionedRow[];
}
/** A transaction exposes the same operations, without a database-specific client. */
export interface ResumeTransaction {
  create(input: CreateResumeRecord): Promise<ResumeRecord>;
  find(id: string): Promise<ResumeRecord | null>;
  sections(resumeId: string, atSnapshot?: number): Promise<SectionRows>;
  liveRows(resumeId: string, table: VersionedTable): Promise<VersionedRow[]>;
  openRow(table: VersionedTable, content: Record<string, unknown>): Promise<void>;
  closeRow(table: VersionedTable, id: string, number: number): Promise<void>;
  latestSnapshot(resumeId: string): Promise<Snapshot | null>;
  createSnapshot(resumeId: string, number: number, message?: string): Promise<Snapshot>;
  materialise(resumeId: string, document: RenderedResume, snapshotId: string | null): Promise<void>;
}
export interface ResumeRepository extends ResumeTransaction {
  transaction<T>(work: (tx: ResumeTransaction) => Promise<T>): Promise<T>;
  findOwned(userId: string, id: string): Promise<ResumeRecord | null>;
  list(profileId: string): Promise<ResumeSummary[]>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Makes this CV the profile's only default. */
  setDefault(profileId: string, id: string): Promise<void>;
  history(resumeId: string, table: VersionedTable, lineageId: string): Promise<VersionedRow[]>;
  snapshots(resumeId: string): Promise<Snapshot[]>;
  snapshot(resumeId: string, number: number): Promise<Snapshot | null>;
  changesAt(resumeId: string, number: number): Promise<SectionChangeRows[]>;
  copyForJob(profileId: string, jobId: string): Promise<ResumeRecord | null>;
  pickSource(profileId: string, sourceResumeId?: string): Promise<ResumeRecord | null>;
  proposal(resumeId: string, proposal: unknown): Promise<void>;
  careerRows(userId: string): Promise<Experience[]>;
  latestIdsForJobs(userId: string, jobIds: readonly string[]): Promise<Record<string, string>>;
}
export interface ProfileDirectory {
  ensureProfile(userId: string): Promise<{ id: string; firstName?: string | null; lastName?: string | null }>;
}
export interface IdGenerator {
  next(): string;
}
export interface ResumeWorkspace {
  id: string;
  document: RenderedResume;
}
export interface WorkspaceInput {
  userId: string;
  job: JobForCopy;
  sourceResumeId?: string;
}
export type { CareerFields };
