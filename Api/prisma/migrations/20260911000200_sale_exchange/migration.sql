-- CreateTable
CREATE TABLE "SaleExchange" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "originalOrderId" TEXT NOT NULL,
    "replacementOrderId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleExchange_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CustomerReturn" ADD COLUMN "exchangeId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "exchangeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SaleExchange_replacementOrderId_key" ON "SaleExchange"("replacementOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleExchange_shopId_idempotencyKey_key" ON "SaleExchange"("shopId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "SaleExchange_shopId_createdAt_idx" ON "SaleExchange"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "SaleExchange_originalOrderId_idx" ON "SaleExchange"("originalOrderId");

-- CreateIndex
CREATE INDEX "CustomerReturn_exchangeId_idx" ON "CustomerReturn"("exchangeId");

-- CreateIndex
CREATE INDEX "Payment_exchangeId_idx" ON "Payment"("exchangeId");

-- AddForeignKey
ALTER TABLE "SaleExchange" ADD CONSTRAINT "SaleExchange_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleExchange" ADD CONSTRAINT "SaleExchange_originalOrderId_fkey" FOREIGN KEY ("originalOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleExchange" ADD CONSTRAINT "SaleExchange_replacementOrderId_fkey" FOREIGN KEY ("replacementOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReturn" ADD CONSTRAINT "CustomerReturn_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "SaleExchange"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "SaleExchange"("id") ON DELETE SET NULL ON UPDATE CASCADE;
