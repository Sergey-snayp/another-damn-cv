-- AlterTable
ALTER TABLE "contact_information" ADD COLUMN     "headline" TEXT;

-- CreateTable
CREATE TABLE "project_entries" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "link" TEXT,
    "from" TEXT,
    "to" TEXT,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "bullets" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdInSnapshot" INTEGER NOT NULL,
    "supersededInSnapshot" INTEGER,

    CONSTRAINT "project_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_entries" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "date" TEXT,
    "link" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdInSnapshot" INTEGER NOT NULL,
    "supersededInSnapshot" INTEGER,

    CONSTRAINT "certification_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_sections" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "bullets" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdInSnapshot" INTEGER NOT NULL,
    "supersededInSnapshot" INTEGER,

    CONSTRAINT "custom_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_entries_resumeId_supersededInSnapshot_idx" ON "project_entries"("resumeId", "supersededInSnapshot");

-- CreateIndex
CREATE INDEX "project_entries_lineageId_idx" ON "project_entries"("lineageId");

-- CreateIndex
CREATE INDEX "certification_entries_resumeId_supersededInSnapshot_idx" ON "certification_entries"("resumeId", "supersededInSnapshot");

-- CreateIndex
CREATE INDEX "certification_entries_lineageId_idx" ON "certification_entries"("lineageId");

-- CreateIndex
CREATE INDEX "custom_sections_resumeId_supersededInSnapshot_idx" ON "custom_sections"("resumeId", "supersededInSnapshot");

-- CreateIndex
CREATE INDEX "custom_sections_lineageId_idx" ON "custom_sections"("lineageId");

-- AddForeignKey
ALTER TABLE "project_entries" ADD CONSTRAINT "project_entries_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_entries" ADD CONSTRAINT "certification_entries_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_sections" ADD CONSTRAINT "custom_sections_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

