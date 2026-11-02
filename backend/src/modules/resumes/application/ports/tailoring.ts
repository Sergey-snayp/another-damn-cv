import type { RenderedResume } from '../../domain/tailoring/resume';
import type { JobForTailoring, Tailoring } from '../../domain/tailoring/types';
import type { TailoringCandidate, RetryCandidate } from '../../domain/tailoring/candidate';
import type { BlockedLine } from '../../domain/tailoring/retry';
export interface TailoringJob {
  id: string;
  title: string | null;
  company: string | null;
  pageTitle: string | null;
  description: string | null;
  extraction: string;
}
export interface TailoringJobReader {
  getForTailoring(userId: string, id: string): Promise<TailoringJob>;
}
export interface ResumeWorkspace {
  forJob(
    userId: string,
    job: TailoringJob,
    sourceResumeId?: string,
  ): Promise<{ id: string; document: RenderedResume }>;
  pending(userId: string, id: string): Promise<Tailoring | null>;
  store(userId: string, id: string, proposal: Tailoring): Promise<void>;
  discard(userId: string, id: string): Promise<void>;
}
export interface TailoringGenerator {
  generate(resume: RenderedResume, job: JobForTailoring): Promise<TailoringCandidate | null>;
  retry(lines: BlockedLine[]): Promise<RetryCandidate[]>;
}
