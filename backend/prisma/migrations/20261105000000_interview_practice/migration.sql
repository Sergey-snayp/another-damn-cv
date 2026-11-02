CREATE TABLE "interview_practice" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "output" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "interview_practice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "interview_practice_kind_check" CHECK ("kind" IN ('hr', 'technical'))
);
CREATE UNIQUE INDEX "interview_practice_jobId_kind_key" ON "interview_practice"("jobId", "kind");
CREATE INDEX "interview_practice_userId_idx" ON "interview_practice"("userId");
ALTER TABLE "interview_practice" ADD CONSTRAINT "interview_practice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_practice" ADD CONSTRAINT "interview_practice_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
