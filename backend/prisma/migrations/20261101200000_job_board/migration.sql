-- The board's statuses. Existing SAVED / APPLIED / DISMISSED keep their meaning.
ALTER TYPE "JobStatus" ADD VALUE 'SCREENING';
ALTER TYPE "JobStatus" ADD VALUE 'INTERVIEW';
ALTER TYPE "JobStatus" ADD VALUE 'OFFER';
ALTER TYPE "JobStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "JobStatus" ADD VALUE 'REJECTED';
ALTER TYPE "JobStatus" ADD VALUE 'DECLINED';

-- The applications table is replaced by the job's own status. It was never
-- written to; refuse to drop it if that ever stopped being true.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "applications") THEN
    RAISE EXCEPTION 'applications has rows; move them to jobs before dropping it';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "applications" DROP CONSTRAINT "applications_userId_fkey";

-- DropTable
DROP TABLE "applications";

-- DropEnum
DROP TYPE "ApplicationStatus";

-- CreateTable
CREATE TABLE "job_status_events" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "from" "JobStatus" NOT NULL,
    "to" "JobStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_status_events_jobId_at_idx" ON "job_status_events"("jobId", "at");

-- AddForeignKey
ALTER TABLE "job_status_events" ADD CONSTRAINT "job_status_events_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
