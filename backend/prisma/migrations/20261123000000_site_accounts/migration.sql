-- The job sites a person has an account on, recorded when signing in or creating an account there worked.
CREATE TABLE "site_accounts" (
    "userId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_accounts_pkey" PRIMARY KEY ("userId","host")
);

ALTER TABLE "site_accounts" ADD CONSTRAINT "site_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
