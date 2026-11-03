-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "telegram" TEXT;

-- CreateTable
CREATE TABLE "saved_answers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "company" TEXT,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_answers_userId_idx" ON "saved_answers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_answers_userId_questionKey_key" ON "saved_answers"("userId", "questionKey");

-- AddForeignKey
ALTER TABLE "saved_answers" ADD CONSTRAINT "saved_answers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

