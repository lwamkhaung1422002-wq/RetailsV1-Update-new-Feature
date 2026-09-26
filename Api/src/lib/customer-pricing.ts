import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

type DbClient = Prisma.TransactionClient | PrismaClient;

export async function ensureWholesalePriceGroup(db: DbClient, shopId: string) {
  return db.customerPriceGroup.upsert({
    where: { shopId_name: { shopId, name: "Wholesale" } },
    update: { isActive: true },
    create: { shopId, name: "Wholesale", isActive: true },
  });
}

export function customerPricing(customer: { priceGroupId: string | null; priceGroup?: { name: string; isActive: boolean } | null }) {
  const priceGroupId = customer.priceGroup?.name === "Wholesale" && customer.priceGroup.isActive
    ? customer.priceGroupId
    : null;
  return { pricingType: priceGroupId ? "WHOLESALE" as const : "RETAIL" as const, priceGroupId };
}
