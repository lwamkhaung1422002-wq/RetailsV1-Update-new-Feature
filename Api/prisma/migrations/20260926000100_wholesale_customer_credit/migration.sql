ALTER TABLE "ShopSetting"
  ADD COLUMN "defaultCreditLimit" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "defaultPaymentTermsDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Customer"
  ADD COLUMN "creditLimitOverride" INTEGER,
  ADD COLUMN "paymentTermsDaysOverride" INTEGER;

ALTER TABLE "Order"
  ADD COLUMN "paymentTermsDaysSnapshot" INTEGER,
  ADD COLUMN "dueAt" TIMESTAMP(3);

ALTER TABLE "Promotion"
  ADD COLUMN "audienceType" TEXT NOT NULL DEFAULT 'ALL';

UPDATE "Promotion" SET "audienceType" = 'WHOLESALE' WHERE "priceGroupId" IS NOT NULL;
