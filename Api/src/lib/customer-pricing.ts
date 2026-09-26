import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

type DbClient = Prisma.TransactionClient | PrismaClient;

export async function ensureWholesalePriceGroup(db: DbClient, shopId: string) {
  return db.customerPriceGroup.upsert({
    where: { shopId_name: { shopId, name: "Wholesale" } },
    update: { isActive: true },
    create: { shopId, name: "Wholesale", isActive: true },
  });
}

export async function wholesalePriceGroupId(db: DbClient, shopId: string) {
  const group = await db.customerPriceGroup.findUnique({
    where: { shopId_name: { shopId, name: "Wholesale" } },
    select: { id: true },
  });
  return group?.id ?? (await ensureWholesalePriceGroup(db, shopId)).id;
}
