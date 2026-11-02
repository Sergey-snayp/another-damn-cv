/** Resumes owns this association. The adapter calls its public API. */
export interface ResumeLinkReader {
  latestIdsForJobs(userId: string, jobIds: readonly string[]): Promise<Record<string, string>>;
}
