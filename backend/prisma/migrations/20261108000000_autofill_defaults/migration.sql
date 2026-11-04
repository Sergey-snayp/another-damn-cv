-- CreateTable
CREATE TABLE "autofill_defaults" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "autofill_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "autofill_defaults_userId_idx" ON "autofill_defaults"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "autofill_defaults_userId_kind_scopeKey_key" ON "autofill_defaults"("userId", "kind", "scopeKey");

-- AddForeignKey
ALTER TABLE "autofill_defaults" ADD CONSTRAINT "autofill_defaults_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
