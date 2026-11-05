-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "salaryCurrency" TEXT,
ADD COLUMN     "salaryMax" INTEGER,
ADD COLUMN     "salaryMin" INTEGER,
ADD COLUMN     "salaryPeriod" TEXT;
