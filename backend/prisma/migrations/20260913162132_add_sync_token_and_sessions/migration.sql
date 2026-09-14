-- Bearer token for the browser extension. Nullable: issued on demand, revocable
-- on its own without touching the web session.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "syncToken" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_syncToken_key" ON "users"("syncToken");

-- Session store table. Created originally by connect-pg-simple; declared here so
-- Prisma's migration history is the single account of the schema.
CREATE TABLE IF NOT EXISTS "user_sessions" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions"("expire");
