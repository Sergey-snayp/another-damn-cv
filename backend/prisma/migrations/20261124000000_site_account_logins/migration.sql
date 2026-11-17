-- A login of its own for one job site (a password changed on that company's Workday only).
-- Both empty: the site uses the one saved login. The password only ever sealed (AES-256-GCM).
ALTER TABLE "site_accounts" ADD COLUMN "email" TEXT;
ALTER TABLE "site_accounts" ADD COLUMN "sealedPassword" TEXT;
ALTER TABLE "site_accounts" ADD COLUMN "loginUpdatedAt" TIMESTAMP(3);
