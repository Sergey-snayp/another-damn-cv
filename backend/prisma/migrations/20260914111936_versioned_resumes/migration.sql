-- AlterTable
-- Prisma emits DROP CONSTRAINT and RENAME CONSTRAINT in one ALTER, which
-- Postgres rejects. Split into valid statements.
ALTER TABLE "user_sessions" DROP CONSTRAINT "session_pkey";
ALTER TABLE "user_sessions" ALTER COLUMN "sid" SET DATA TYPE TEXT;
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid");

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "preferredName" TEXT,
    "pronouns" TEXT,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "location" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "linkedin" TEXT,
    "github" TEXT,
    "portfolio" TEXT,
    "website" TEXT,
    "workAuthorization" TEXT,
    "requiresSponsorship" TEXT,
    "salaryExpectation" TEXT,
    "noticePeriod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumes" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetRole" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "currentSnapshotId" TEXT,
    "current" JSONB,
    "materialisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_information" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "location" TEXT,
    "linkedin" TEXT,
    "github" TEXT,
    "website" TEXT,
    "createdInSnapshot" INTEGER NOT NULL,
    "supersededInSnapshot" INTEGER,

    CONSTRAINT "contact_information_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experience_entries" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "client" TEXT,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT,
    "current" BOOLEAN NOT NULL DEFAULT false,
    "blurb" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdInSnapshot" INTEGER NOT NULL,
    "supersededInSnapshot" INTEGER,

    CONSTRAINT "experience_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "experienceLineageId" TEXT NOT NULL,
    "problem" TEXT,
    "action" TEXT,
    "result" TEXT,
    "bullet" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "evidence" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 3,
    "authoredBy" TEXT NOT NULL DEFAULT 'generator',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdInSnapshot" INTEGER NOT NULL,
    "supersededInSnapshot" INTEGER,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education_entries" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "fullName" TEXT,
    "degree" TEXT NOT NULL,
    "field" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdInSnapshot" INTEGER NOT NULL,
    "supersededInSnapshot" INTEGER,

    CONSTRAINT "education_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_entries" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "level" TEXT,
    "years" INTEGER,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "evidence" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 3,
    "aliases" TEXT[],
    "createdInSnapshot" INTEGER NOT NULL,
    "supersededInSnapshot" INTEGER,

    CONSTRAINT "skill_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summary_variants" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdInSnapshot" INTEGER NOT NULL,
    "supersededInSnapshot" INTEGER,

    CONSTRAINT "summary_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_userId_key" ON "profiles"("userId");

-- CreateIndex
CREATE INDEX "resumes_profileId_idx" ON "resumes"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "snapshots_resumeId_number_key" ON "snapshots"("resumeId", "number");

-- CreateIndex
CREATE INDEX "contact_information_resumeId_supersededInSnapshot_idx" ON "contact_information"("resumeId", "supersededInSnapshot");

-- CreateIndex
CREATE INDEX "contact_information_lineageId_idx" ON "contact_information"("lineageId");

-- CreateIndex
CREATE INDEX "experience_entries_resumeId_supersededInSnapshot_idx" ON "experience_entries"("resumeId", "supersededInSnapshot");

-- CreateIndex
CREATE INDEX "experience_entries_lineageId_idx" ON "experience_entries"("lineageId");

-- CreateIndex
CREATE INDEX "achievements_resumeId_supersededInSnapshot_idx" ON "achievements"("resumeId", "supersededInSnapshot");

-- CreateIndex
CREATE INDEX "achievements_experienceLineageId_idx" ON "achievements"("experienceLineageId");

-- CreateIndex
CREATE INDEX "achievements_lineageId_idx" ON "achievements"("lineageId");

-- CreateIndex
CREATE INDEX "education_entries_resumeId_supersededInSnapshot_idx" ON "education_entries"("resumeId", "supersededInSnapshot");

-- CreateIndex
CREATE INDEX "education_entries_lineageId_idx" ON "education_entries"("lineageId");

-- CreateIndex
CREATE INDEX "skill_entries_resumeId_supersededInSnapshot_idx" ON "skill_entries"("resumeId", "supersededInSnapshot");

-- CreateIndex
CREATE INDEX "skill_entries_lineageId_idx" ON "skill_entries"("lineageId");

-- CreateIndex
CREATE INDEX "summary_variants_resumeId_supersededInSnapshot_idx" ON "summary_variants"("resumeId", "supersededInSnapshot");

-- CreateIndex
CREATE INDEX "summary_variants_lineageId_idx" ON "summary_variants"("lineageId");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_information" ADD CONSTRAINT "contact_information_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_entries" ADD CONSTRAINT "experience_entries_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education_entries" ADD CONSTRAINT "education_entries_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_entries" ADD CONSTRAINT "skill_entries_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summary_variants" ADD CONSTRAINT "summary_variants_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Partial indexes. Prisma cannot express a WHERE clause on an index, so these
-- are appended by hand.

-- Exactly one live row per logical entry. Without this, a race between two
-- saves leaves two rows claiming to be current and every read silently returns
-- a duplicate.
CREATE UNIQUE INDEX "contact_information_one_live"
  ON "contact_information" ("lineageId") WHERE "supersededInSnapshot" IS NULL;
CREATE UNIQUE INDEX "experience_entries_one_live"
  ON "experience_entries" ("lineageId") WHERE "supersededInSnapshot" IS NULL;
CREATE UNIQUE INDEX "achievements_one_live"
  ON "achievements" ("lineageId") WHERE "supersededInSnapshot" IS NULL;
CREATE UNIQUE INDEX "education_entries_one_live"
  ON "education_entries" ("lineageId") WHERE "supersededInSnapshot" IS NULL;
CREATE UNIQUE INDEX "skill_entries_one_live"
  ON "skill_entries" ("lineageId") WHERE "supersededInSnapshot" IS NULL;
CREATE UNIQUE INDEX "summary_variants_one_live"
  ON "summary_variants" ("lineageId") WHERE "supersededInSnapshot" IS NULL;

-- Reading the live resume is the hot path; these cover only live rows, so they
-- stay small however much history accumulates.
CREATE INDEX "experience_entries_live"
  ON "experience_entries" ("resumeId", "position") WHERE "supersededInSnapshot" IS NULL;
CREATE INDEX "achievements_live"
  ON "achievements" ("experienceLineageId", "position") WHERE "supersededInSnapshot" IS NULL;
CREATE INDEX "skill_entries_live"
  ON "skill_entries" ("resumeId", "category") WHERE "supersededInSnapshot" IS NULL;
