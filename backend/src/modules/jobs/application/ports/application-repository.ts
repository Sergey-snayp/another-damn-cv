import type { Job } from '../../domain/job';
import type { NewJob } from './job-repository';

export interface ApplicationDraft {
  job: NewJob;
  statusAt: Date;
}

export interface ApplicationPreferences {
  favorite?: boolean;
  archived?: boolean;
}

export interface ApplicationRepository {
  exportApplications(userId: string): Promise<Job[]>;
  createApplication(draft: ApplicationDraft): Promise<Job>;
  importApplications(
    userId: string,
    drafts: ApplicationDraft[],
  ): Promise<{ imported: number; skipped: number }>;
  updatePreferences(
    userId: string,
    ids: readonly string[],
    preferences: ApplicationPreferences,
    at: Date,
  ): Promise<Job[]>;
}

export interface ApplicationResumeReader {
  savedSnapshot(userId: string, resumeId: string, number?: number): Promise<number | null>;
}
