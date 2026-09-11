CREATE TABLE "ManagerApprovalToken" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerApprovalToken_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagerApprovalToken_shopId_expiresAt_idx"
ON "ManagerApprovalToken"("shopId", "expiresAt");
