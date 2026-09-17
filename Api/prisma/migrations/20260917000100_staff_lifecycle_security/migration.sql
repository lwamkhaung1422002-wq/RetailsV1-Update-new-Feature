ALTER TABLE "User"
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "loginResetRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "StaffInvite" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffPasswordResetToken" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffInvite_tokenHash_key" ON "StaffInvite"("tokenHash");
CREATE INDEX "StaffInvite_shopId_email_idx" ON "StaffInvite"("shopId", "email");
CREATE INDEX "StaffInvite_shopId_expiresAt_idx" ON "StaffInvite"("shopId", "expiresAt");
CREATE UNIQUE INDEX "StaffInvite_one_pending_per_email_key" ON "StaffInvite"("shopId", "email")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "StaffPasswordResetToken_tokenHash_key" ON "StaffPasswordResetToken"("tokenHash");
CREATE INDEX "StaffPasswordResetToken_shopId_userId_idx" ON "StaffPasswordResetToken"("shopId", "userId");
CREATE INDEX "StaffPasswordResetToken_userId_expiresAt_idx" ON "StaffPasswordResetToken"("userId", "expiresAt");
CREATE UNIQUE INDEX "StaffPasswordResetToken_one_active_per_user_key" ON "StaffPasswordResetToken"("userId")
  WHERE "usedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffPasswordResetToken" ADD CONSTRAINT "StaffPasswordResetToken_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffPasswordResetToken" ADD CONSTRAINT "StaffPasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffPasswordResetToken" ADD CONSTRAINT "StaffPasswordResetToken_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
