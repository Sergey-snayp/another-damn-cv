-- AlterTable
ALTER TABLE "resumes" ADD COLUMN     "theme" JSONB;

-- CreateTable
CREATE TABLE "resume_pdfs" (
    "resumeId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "pdf" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_pdfs_pkey" PRIMARY KEY ("resumeId")
);

-- AddForeignKey
ALTER TABLE "resume_pdfs" ADD CONSTRAINT "resume_pdfs_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
