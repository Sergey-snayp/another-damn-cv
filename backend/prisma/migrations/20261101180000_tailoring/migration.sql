-- AlterTable
ALTER TABLE "resumes" ADD COLUMN     "jobId" TEXT,
ADD COLUMN     "sourceResumeId" TEXT,
ADD COLUMN     "tailoring" JSONB;

-- AlterTable
ALTER TABLE "skill_entries" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Skills had no order and were read in storage order. Number them in that
-- order, so the first save after this does not re-version every skill.
UPDATE "skill_entries" AS s SET "position" = n.pos
FROM (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY "resumeId" ORDER BY ctid)) - 1 AS pos
  FROM "skill_entries" WHERE "supersededInSnapshot" IS NULL
) AS n
WHERE s.id = n.id;

-- CreateIndex
CREATE INDEX "resumes_jobId_idx" ON "resumes"("jobId");

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
