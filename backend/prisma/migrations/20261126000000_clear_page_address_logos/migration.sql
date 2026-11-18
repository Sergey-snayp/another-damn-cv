-- Extensions before 0.83.2 could save the job page's own address as its logo.
UPDATE "jobs"
SET "companyLogo" = NULL
WHERE split_part(split_part("companyLogo", '#', 1), '?', 1)
  IN (split_part(split_part("url", '#', 1), '?', 1), split_part(split_part("canonicalUrl", '#', 1), '?', 1));
