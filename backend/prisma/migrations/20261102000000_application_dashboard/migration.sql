-- Add account-owned dashboard state without changing existing job statuses.
ALTER TABLE "jobs"
  ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "appliedAt" TIMESTAMP(3),
  ADD COLUMN "applicationResumeId" TEXT,
  ADD COLUMN "applicationSnapshot" INTEGER;

-- Existing application dates come from their first recorded move out of Saved.
UPDATE "jobs" AS j SET "appliedAt" = COALESCE(
  (SELECT MIN(e."at") FROM "job_status_events" AS e
   WHERE e."jobId" = j."id" AND e."to" NOT IN ('SAVED', 'DISMISSED')),
  CASE WHEN j."status" NOT IN ('SAVED', 'DISMISSED') THEN j."capturedAt" ELSE NULL END
);

CREATE INDEX "jobs_userId_archivedAt_idx" ON "jobs"("userId", "archivedAt");
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_applicationResumeId_fkey"
  FOREIGN KEY ("applicationResumeId") REFERENCES "resumes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
