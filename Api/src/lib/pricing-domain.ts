import { Prisma, PrismaClient } from "../generated/prisma/client.js";

// Price lookup endpoints are read-only.  Accepting the root client lets their
// independent lookup queries use the connection pool instead of being
// serialized on one interactive-transaction connection.  Write flows keep
// passing their transaction client and retain their existing atomic behavior.
type DbClient = Prisma.TransactionClient | PrismaClient;

export function priceTargetKey(productId: string, variantId?: string | null, productUnitId?: string | null): string {
  return `${productId}:${variantId ?? "*"}:${productUnitId ?? "*"}`;
}

export function promotionTargetKey(input: {
  productId: string;
  variantId?: string | null | undefined;
  productUnitId?: string | null | undefined;
  priceGroupId?: string | null | undefined;
  channel?: string | null | undefined;
}): string {
  return `${priceTargetKey(input.productId, input.variantId, input.productUnitId)}:${input.priceGroupId ?? "*"}:${(input.channel ?? "ALL").toUpperCase()}`;
}

/**
 * Keys ordered from the most specific promotion target to the product-wide
 * fallback.  Writes use `promotionTargetKey`; resolution uses this same
 * shape, while retaining the old price-key format for records created before
 * promotion targets gained price-group and channel segments.
 */
function promotionTargetKeys(input: {
  productId: string;
  variantId?: string | null | undefined;
  productUnitId?: string | null | undefined;
  priceGroupId?: string | null | undefined;
  channel?: string | null | undefined;
}): string[] {
  const channels = [...new Set([input.channel ?? "ALL", "ALL"])];
  const variants = [...new Set([input.variantId ?? null, null])];
  const units = [...new Set([input.productUnitId ?? null, null])];
  const priceGroups = [...new Set([input.priceGroupId ?? null, null])];
  const current = variants.flatMap((variantId) =>
    units.flatMap((productUnitId) =>
      priceGroups.flatMap((priceGroupId) =>
        channels.map((channel) => promotionTargetKey({ productId: input.productId, variantId, productUnitId, priceGroupId, channel })),
      ),
    ),
  );
  const legacy = variants.flatMap((variantId) =>
    units.map((productUnitId) => priceTargetKey(input.productId, variantId, productUnitId)),
  );
  return [...new Set([...current, ...legacy])];
}

export function effectivePromotionState(promotion: { state: string; startsAt: Date; endsAt: Date }, at = new Date()): string {
  if (["DRAFT", "PAUSED", "CANCELLED"].includes(promotion.state)) return promotion.state;
  if (promotion.endsAt <= at) return "ENDED";
  if (promotion.startsAt > at) return "SCHEDULED";
  return "RUNNING";
}

export async function assertPricingTarget(
  tx: DbClient,
  shopId: string,
  input: { productId: string; variantId?: string | null | undefined; productUnitId?: string | null | undefined; priceGroupId?: string | null | undefined },
) {
  const product = await tx.product.findFirst({
    where: { id: input.productId, shopId },
    include: { variants: true, units: { include: { unit: true } } },
  });
  if (!product) throw Object.assign(new Error("Product not found."), { name: "NotFoundError" });
  const variant = input.variantId ? product.variants.find((item) => item.id === input.variantId) : null;
  if (input.variantId && !variant) throw Object.assign(new Error("Variant not found."), { name: "NotFoundError" });
  const productUnit = input.productUnitId ? product.units.find((item) => item.id === input.productUnitId) : null;
  if (input.productUnitId && !productUnit) throw Object.assign(new Error("Product unit not found."), { name: "NotFoundError" });
  if (input.priceGroupId && !await tx.customerPriceGroup.findFirst({ where: { id: input.priceGroupId, shopId } })) {
    throw Object.assign(new Error("Customer price group not found."), { name: "NotFoundError" });
  }
  return { product, variant, productUnit };
}

export async function ensureDefaultPriceBook(tx: DbClient, shopId: string) {
  const existing = await tx.priceBook.findFirst({ where: { shopId, isDefault: true, isActive: true } });
  if (existing) return existing;
  const setting = await tx.shopSetting.findUnique({ where: { shopId }, select: { currencyCode: true } });
  return tx.priceBook.upsert({
    where: { shopId_name: { shopId, name: "Default" } },
    update: { isDefault: true, isActive: true },
    create: { shopId, name: "Default", currencyCode: setting?.currencyCode ?? "MMK", isDefault: true },
  });
}

export async function activateDuePriceEntries(tx: DbClient, shopId: string, now = new Date()) {
  const entries = await tx.priceEntry.findMany({
    where: { shopId, status: "SCHEDULED", effectiveFrom: { lte: now } },
    include: { product: true, variant: true },
    orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
  });
  for (const entry of entries) {
    await tx.priceEntry.updateMany({
      where: { shopId, targetKey: entry.targetKey, status: "ACTIVE", OR: [{ effectiveTo: null }, { effectiveTo: { gt: entry.effectiveFrom } }] },
      data: { effectiveTo: entry.effectiveFrom, status: "EXPIRED" },
    });
    await tx.priceEntry.update({ where: { id: entry.id }, data: { status: "ACTIVE", previousUnitPrice: entry.variant?.price ?? entry.product.price } });
    if (!entry.productUnitId) {
      if (entry.variantId) await tx.productVariant.update({ where: { id: entry.variantId }, data: { price: entry.unitPrice } });
      else await tx.product.update({ where: { id: entry.productId }, data: { price: entry.unitPrice, version: { increment: 1 } } });
    }
  }
}

function roundMoney(value: Prisma.Decimal): number {
  return Number(value.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toString());
}

export async function resolvePrice(
  tx: DbClient,
  shopId: string,
  input: {
    productId: string;
    variantId?: string | null | undefined;
    productUnitId?: string | null | undefined;
    priceGroupId?: string | null | undefined;
    quantity: Prisma.Decimal;
    channel?: string | undefined;
    manualDiscount?: number | undefined;
    at?: Date | undefined;
    activateDueEntries?: boolean | undefined;
  },
) {
  // Scheduled entries are already included by the effective-date query below.
  // Interactive order writes keep the existing materialization side effect;
  // read-only pricing lookups opt out so scanning and catalog selection do not
  // perform unrelated shop-wide writes before returning a price.
  if (input.activateDueEntries !== false) {
    await activateDuePriceEntries(tx, shopId, input.at ?? new Date());
  }
  const { product, variant, productUnit } = await assertPricingTarget(tx, shopId, input);
  const enteredQuantity = input.quantity;
  const conversionFactor = productUnit?.conversionFactor ?? new Prisma.Decimal(1);
  const baseQuantity = enteredQuantity.mul(conversionFactor).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
  const at = input.at ?? new Date();
  const targetKeys = [
    priceTargetKey(product.id, variant?.id, productUnit?.id),
    priceTargetKey(product.id, variant?.id, null),
    priceTargetKey(product.id, null, productUnit?.id),
    priceTargetKey(product.id, null, null),
  ];
  const channel = input.channel ?? "ALL";
  const promotionKeys = promotionTargetKeys({
    productId: product.id,
    variantId: variant?.id,
    productUnitId: productUnit?.id,
    priceGroupId: input.priceGroupId,
    channel,
  });
  const entryQuery = tx.priceEntry.findFirst({
    where: {
      shopId,
      targetKey: { in: targetKeys },
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      status: { not: "CANCELLED" },
    },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  const tiersQuery = tx.priceTier.findMany({
    where: {
      productId: product.id,
      OR: [{ variantId: variant?.id ?? null }, { variantId: null }],
      AND: [
        { OR: [
          { productUnitId: productUnit?.id ?? null, minimumQuantity: { lte: enteredQuantity } },
          { productUnitId: null, minimumQuantity: { lte: baseQuantity } },
        ] },
        { priceGroupId: input.priceGroupId ?? null },
      ],
    },
  });
  const promotionsQuery = tx.promotion.findMany({
    where: {
      shopId,
      targetKey: { in: promotionKeys },
      startsAt: { lte: at },
      endsAt: { gt: at },
      state: { in: ["SCHEDULED", "RUNNING"] },
      audienceType: { in: ["ALL", input.priceGroupId ? "WHOLESALE" : "RETAIL"] },
      OR: [
        { productUnitId: productUnit?.id ?? null, minimumQuantity: { lte: enteredQuantity } },
        { productUnitId: null, minimumQuantity: { lte: baseQuantity } },
      ],
    },
    orderBy: [{ priority: "desc" }, { startsAt: "desc" }],
  });
  // Public pricing reads use the root Prisma client, so these independent
  // lookups can use separate pooled connections. Write transactions retain
  // their current sequential execution on the transaction connection.
  const [entry, tiers, promotions] = "$transaction" in tx
    ? [await entryQuery, await tiersQuery, await promotionsQuery]
    : await Promise.all([entryQuery, tiersQuery, promotionsQuery]);
  const entryIsUnitSpecific = Boolean(entry?.productUnitId);
  const baseRegularPrice = entry?.unitPrice ?? variant?.price ?? product.price;
  const regularUnitPrice = entryIsUnitSpecific || !productUnit
    ? baseRegularPrice
    : roundMoney(new Prisma.Decimal(baseRegularPrice).mul(conversionFactor));
  // Wholesale V1 is always tied to an explicit selling unit; old generic
  // group tiers must not silently price a different pack/carton quantity.
  const eligibleTiers = input.priceGroupId ? tiers.filter((item) => item.productUnitId !== null) : tiers;
  const tier = eligibleTiers.sort((a, b) => {
    if (Boolean(a.variantId) !== Boolean(b.variantId)) return Number(Boolean(b.variantId)) - Number(Boolean(a.variantId));
    if (Boolean(a.productUnitId) !== Boolean(b.productUnitId)) return Number(Boolean(b.productUnitId)) - Number(Boolean(a.productUnitId));
    return Number(b.minimumQuantity.minus(a.minimumQuantity).toString());
  })[0] ?? null;
  const tierUnitPrice = tier
    ? tier.productUnitId || !productUnit ? tier.unitPrice : roundMoney(new Prisma.Decimal(tier.unitPrice).mul(conversionFactor))
    : null;
  const promotionBaseDefault = tierUnitPrice ?? regularUnitPrice;
  const promotion = promotions[0] ?? null;
  const promotionBase = promotion?.discountBase === "REGULAR_PRICE" ? regularUnitPrice : promotionBaseDefault;
  let promotionDiscount = 0;
  if (promotion?.type === "FIXED_PRICE") {
    const fixedPrice = productUnit && !promotion.productUnitId
      ? roundMoney(promotion.value.mul(conversionFactor))
      : roundMoney(promotion.value);
    promotionDiscount = Math.max(0, promotionBase - fixedPrice);
  }
  if (promotion?.type === "PERCENTAGE") {
    promotionDiscount = Math.min(promotionBase, roundMoney(new Prisma.Decimal(promotionBase).mul(promotion.value).div(100)));
  }
  const afterPromotion = Math.max(0, promotionBaseDefault - promotionDiscount);
  const manualDiscount = Math.max(0, Math.trunc(input.manualDiscount ?? 0));
  if (manualDiscount > afterPromotion) {
    throw Object.assign(new Error("Manual discount cannot exceed the resolved price."), { name: "BadRequestError" });
  }
  const finalUnitPrice = afterPromotion - manualDiscount;
  return {
    pricingType: input.priceGroupId ? "WHOLESALE" : "RETAIL",
    priceGroupId: input.priceGroupId ?? null,
    priceGroupName: input.priceGroupId ? "Wholesale" : null,
    regularUnitPrice,
    tierUnitPrice,
    appliedTierId: tier?.id ?? null,
    appliedTierMinimumQuantity: tier?.minimumQuantity?.toString() ?? null,
    appliedTierUnitId: tier?.productUnitId ?? null,
    promotionId: promotion?.id ?? null,
    promotionName: promotion?.name ?? null,
    promotionType: promotion?.type ?? null,
    promotionValue: promotion?.value?.toString() ?? null,
    promotionMinimumQuantity: promotion?.minimumQuantity?.toString() ?? null,
    promotionDiscount,
    manualDiscount,
    finalUnitPrice,
    priceEntryId: entry?.id ?? null,
    priceResolvedAt: at,
    currencyCode: entry?.currencyCode ?? "MMK",
  };
}
