CREATE TABLE "interview_preparations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "interviewType" TEXT,
  "interviewer" TEXT NOT NULL DEFAULT '',
  "instructions" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "questions" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "interview_preparations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "interview_preparations_jobId_key" ON "interview_preparations"("jobId");
CREATE INDEX "interview_preparations_userId_idx" ON "interview_preparations"("userId");
ALTER TABLE "interview_preparations" ADD CONSTRAINT "interview_preparations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_preparations" ADD CONSTRAINT "interview_preparations_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
