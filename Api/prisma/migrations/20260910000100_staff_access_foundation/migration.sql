CREATE TABLE "ShopMember" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopRolePolicy" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopRolePolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopMember_shopId_userId_key" ON "ShopMember"("shopId", "userId");
CREATE INDEX "ShopMember_shopId_active_idx" ON "ShopMember"("shopId", "active");
CREATE INDEX "ShopMember_userId_active_idx" ON "ShopMember"("userId", "active");
CREATE UNIQUE INDEX "ShopRolePolicy_shopId_role_key" ON "ShopRolePolicy"("shopId", "role");
CREATE INDEX "ShopRolePolicy_shopId_idx" ON "ShopRolePolicy"("shopId");

ALTER TABLE "ShopMember" ADD CONSTRAINT "ShopMember_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopMember" ADD CONSTRAINT "ShopMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopRolePolicy" ADD CONSTRAINT "ShopRolePolicy_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
