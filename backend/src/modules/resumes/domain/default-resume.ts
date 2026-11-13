/**
 * Every person with a CV has exactly one default CV: the master the others are
 * tailored from, and the one the extension offers on a new job. It is the CV
 * marked as default; with none marked, the first original CV made (a copy
 * tailored for a job is not a master); with only copies, the first one.
 * Several marked (older data): the first of those.
 */
export function defaultResumeId(rows: readonly { id: string; isPrimary: boolean; jobId: string | null; createdAt: Date }[]): string | null {
  const byAge = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  return (byAge.find((row) => row.isPrimary) ?? byAge.find((row) => !row.jobId) ?? byAge[0])?.id ?? null;
}
