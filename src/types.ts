export type AtsKind = 'greenhouse' | 'lever' | 'ashby' | 'unknown';

/** A posting after normalization, before scoring. */
export interface RawJob {
  /** Stable across runs: `${source}:${company}:${externalId}`. */
  id: string;
  source: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  description: string;
  url: string;
  postedAt: string | null;
  compensation: string | null;
}

export interface ScoredJob extends RawJob {
  score: number;
  verdict: string;
  matches: string[];
  gaps: string[];
}

export type JobStatus =
  | 'new' | 'digested' | 'skipped' | 'saved' | 'tailored' | 'applied' | 'rejected';

export interface JobSource {
  readonly name: string;
  fetch(): Promise<RawJob[]>;
}

/** Structured resume content produced by the tailorer. */
export interface TailoredResume {
  headline: string;
  summary: string;
  skillGroups: { label: string; items: string[] }[];
  experience: {
    company: string;
    title: string;
    dates: string;
    context?: string;
    bullets: string[];
  }[];
  keywordsCovered: string[];
}
