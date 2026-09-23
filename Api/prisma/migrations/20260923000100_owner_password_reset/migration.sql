CREATE TABLE "OwnerPasswordResetChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "verifiedAt" TIMESTAMP(3),
  "resetTokenHash" TEXT,
  "resetExpiresAt" TIMESTAMP(3),
  "usedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnerPasswordResetChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwnerPasswordResetChallenge_resetTokenHash_key" ON "OwnerPasswordResetChallenge"("resetTokenHash");
CREATE INDEX "OwnerPasswordResetChallenge_userId_createdAt_idx" ON "OwnerPasswordResetChallenge"("userId", "createdAt");
CREATE INDEX "OwnerPasswordResetChallenge_expiresAt_idx" ON "OwnerPasswordResetChallenge"("expiresAt");
CREATE UNIQUE INDEX "OwnerPasswordResetChallenge_one_active_per_user_key" ON "OwnerPasswordResetChallenge"("userId")
  WHERE "usedAt" IS NULL AND "invalidatedAt" IS NULL;

ALTER TABLE "OwnerPasswordResetChallenge" ADD CONSTRAINT "OwnerPasswordResetChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
