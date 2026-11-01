-- Postings you might apply to: from the extension, the scanner, or pasted.
CREATE TYPE "JobSource" AS ENUM ('EXTENSION', 'SCANNER', 'MANUAL');
CREATE TYPE "JobStatus" AS ENUM ('SAVED', 'DISMISSED', 'APPLIED');
CREATE TYPE "JobExtraction" AS ENUM ('PENDING', 'STRUCTURED', 'LLM', 'MANUAL', 'FAILED');

CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "JobSource" NOT NULL,
    "url" TEXT,
    "canonicalUrl" TEXT,
    "title" TEXT,
    "company" TEXT,
    "location" TEXT,
    "remote" BOOLEAN,
    "employmentType" TEXT,
    "salary" TEXT,
    "postedAt" TIMESTAMP(3),
    "description" TEXT,
    "editedFields" TEXT[],
    "pageTitle" TEXT,
    "html" TEXT,
    "pageText" TEXT,
    "structuredData" JSONB,
    "extraction" "JobExtraction" NOT NULL,
    "extractionError" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'SAVED',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- Sending the same job twice updates it. Nulls (pasted jobs with no link) never collide.
CREATE UNIQUE INDEX "jobs_userId_canonicalUrl_key" ON "jobs"("userId", "canonicalUrl");
CREATE INDEX "jobs_userId_status_createdAt_idx" ON "jobs"("userId", "status", "createdAt");
CREATE INDEX "jobs_extraction_idx" ON "jobs"("extraction");

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
