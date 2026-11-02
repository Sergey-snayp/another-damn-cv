ALTER TABLE "jobs"
  ADD COLUMN "interviewDate" TEXT,
  ADD COLUMN "interviewTime" TEXT,
  ADD COLUMN "interviewTimeZone" TEXT;

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_interview_schedule_check" CHECK (
  ("interviewDate" IS NULL AND "interviewTime" IS NULL AND "interviewTimeZone" IS NULL)
  OR
  ("interviewDate" IS NOT NULL AND "interviewTimeZone" IS NOT NULL
   AND "interviewDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND ("interviewTime" IS NULL OR "interviewTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
);
