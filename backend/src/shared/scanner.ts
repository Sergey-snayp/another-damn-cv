/**
 * Repository scanning.
 *
 * The scanner PROPOSES; a human confirms. Code cannot tell whether the owner
 * introduced a dependency or merely worked beside it, so nothing it finds is
 * marked verified until a person says so. That distinction is the whole
 * difference between this and a plausible-lie generator.
 */

export interface RepoFacts {
  repoPath: string;
  repoName: string;
  remote?: string;
  /** From `git shortlog -sn --all` — the number nobody can fake. */
  commits?: { byOwner: number; total: number };
  dateRange?: { first: string; last: string };
  dependencies: string[];
  databases: string[];
  infrastructure: string[];
  testing: string[];
  /** Model and migration counts, file and line totals. */
  scale: Record<string, number>;
  /** Commit subjects that look like achievements, for a human to review. */
  candidateAchievements: string[];
  /** Set when git failed — packfile corruption is common in old client repos. */
  degraded?: string;
}

export interface ScanProposal {
  facts: RepoFacts;
  /** Always enters the base as verified:false until confirmed. */
  proposedSkills: string[];
}
