-- The extension's one login for job-site accounts. The password is sealed by the server.
CREATE TABLE "site_logins" (
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sealedPassword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_logins_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "site_logins" ADD CONSTRAINT "site_logins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
