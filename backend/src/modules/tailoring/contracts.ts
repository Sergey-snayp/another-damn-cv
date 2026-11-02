import type { Tailoring } from './domain/types';
export type { Tailoring } from './domain/types';
export interface TailoringApi {
  tailorForJob(
    userId: string,
    jobId: string,
    sourceResumeId?: string,
  ): Promise<{ resumeId: string; tailoring: Tailoring }>;
  pending(userId: string, resumeId: string): Promise<{ tailoring: Tailoring | null }>;
  discard(userId: string, resumeId: string): Promise<void>;
}
