import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { resolvePrice } from "./pricing-domain.js";

const decimal = (value: number) => new Prisma.Decimal(value);
type QuantityBranch = { productUnitId: string | null; minimumQuantity: { lte: Prisma.Decimal } };
type Tier = { id: string; productUnitId: string | null; variantId: string | null; priceGroupId: string | null; minimumQuantity: Prisma.Decimal; unitPrice: number };
type Promotion = { id: string; productUnitId: string | null; minimumQuantity: Prisma.Decimal; type: string; value: Prisma.Decimal; discountBase: string; priority: number; name: string; audienceType?: string };

function fixture(tiers: Tier[] = [], promotions: Promotion[] = []) {
  const units = [
    { id: "piece", unitId: "piece-uom", conversionFactor: decimal(1), isBase: true, unit: { symbol: "pc", precision: 0 } },
    { id: "pack", unitId: "pack-uom", conversionFactor: decimal(6), isBase: false, unit: { symbol: "pack", precision: 0 } },
    { id: "carton", unitId: "carton-uom", conversionFactor: decimal(24), isBase: false, unit: { symbol: "ctn", precision: 0 } },
  ];
  const matches = (item: { productUnitId: string | null; minimumQuantity: Prisma.Decimal }, branches: QuantityBranch[]) =>
    branches.some((branch) => item.productUnitId === branch.productUnitId && item.minimumQuantity.lte(branch.minimumQuantity.lte));
  const tierFind = vi.fn(async ({ where }: { where: { AND: [{ OR: QuantityBranch[] }, { priceGroupId: string | null }] } }) =>
    tiers.filter((tier) => tier.priceGroupId === where.AND[1].priceGroupId && matches(tier, where.AND[0].OR)));
  const promotionFind = vi.fn(async ({ where }: { where: { OR: QuantityBranch[]; audienceType: { in: string[] } } }) =>
    promotions.filter((promotion) => where.audienceType.in.includes(promotion.audienceType || "ALL") && matches(promotion, where.OR)).sort((left, right) => right.priority - left.priority));
  const tx = {
    product: { findFirst: vi.fn(async () => ({ id: "product", price: 1000, variants: [], units })) },
    priceEntry: { findFirst: vi.fn(async () => null) },
    priceTier: { findMany: tierFind },
    promotion: { findMany: promotionFind },
    customerPriceGroup: { findFirst: vi.fn(async () => ({ id: "wholesale", name: "Wholesale" })) },
  } as unknown as PrismaClient;
  const resolve = (unit: "piece" | "pack" | "carton", quantity: number, priceGroupId: string | null = null) => resolvePrice(tx, "shop", {
    productId: "product", productUnitId: unit, priceGroupId, quantity: decimal(quantity), activateDueEntries: false,
  });
  return { resolve, tierFind, promotionFind };
}

const tier = (id: string, productUnitId: string | null, minimumQuantity: number, unitPrice: number, priceGroupId: string | null = null): Tier => ({
  id, productUnitId, variantId: null, priceGroupId, minimumQuantity: decimal(minimumQuantity), unitPrice,
});
const promotion = (id: string, productUnitId: string | null, minimumQuantity: number, type: string, value: number, discountBase = "RESOLVED_TIER_PRICE"): Promotion => ({
  id, productUnitId, minimumQuantity: decimal(minimumQuantity), type, value: decimal(value), discountBase, priority: 1, name: id,
});

describe("unit-aware pricing quantities", () => {
  it.each([
    ["piece", 1000], ["pack", 6000], ["carton", 24000],
  ] as const)("derives the regular %s price from the base price", async (unit, expected) => {
    expect((await fixture().resolve(unit, 1)).finalUnitPrice).toBe(expected);
  });

  it("uses entered Cartons for unit-specific tier thresholds and never double-converts their prices", async () => {
    const { resolve } = fixture([tier("five-cartons", "carton", 5, 20000), tier("ten-cartons", "carton", 10, 18000)]);
    expect((await resolve("carton", 1)).appliedTierId).toBeNull();
    expect((await resolve("carton", 5)).tierUnitPrice).toBe(20000);
    expect((await resolve("carton", 5)).finalUnitPrice).toBe(20000);
    expect((await resolve("carton", 10)).tierUnitPrice).toBe(18000);
  });

  it("uses base Pieces for generic tier thresholds and converts a base price to the selected unit", async () => {
    const { resolve, tierFind } = fixture([tier("hundred-pieces", null, 100, 900)]);
    expect((await resolve("carton", 4)).appliedTierId).toBeNull();
    const result = await resolve("carton", 5);
    expect(result.appliedTierId).toBe("hundred-pieces");
    expect(result.tierUnitPrice).toBe(21600);
    expect(result.finalUnitPrice).toBe(21600);
    const branches = tierFind.mock.calls[1]![0].where.AND[0]!.OR;
    expect(branches.find((branch) => branch.productUnitId === "carton")!.minimumQuantity.lte.eq(5)).toBe(true);
    expect(branches.find((branch) => branch.productUnitId === null)!.minimumQuantity.lte.eq(120)).toBe(true);
  });

  it("uses entered quantity for unit-specific promotions", async () => {
    const { resolve } = fixture([], [promotion("five-cartons", "carton", 5, "FIXED_PRICE", 20000)]);
    expect((await resolve("carton", 1)).promotionId).toBeNull();
    expect((await resolve("carton", 5)).finalUnitPrice).toBe(20000);
  });

  it("uses base quantity for generic fixed-price promotions and converts their price", async () => {
    const { resolve, promotionFind } = fixture([], [promotion("hundred-pieces", null, 100, "FIXED_PRICE", 800)]);
    expect((await resolve("carton", 4)).promotionId).toBeNull();
    const result = await resolve("carton", 5);
    expect(result.promotionId).toBe("hundred-pieces");
    expect(result.finalUnitPrice).toBe(19200);
    const branches = promotionFind.mock.calls[1]![0].where.OR;
    expect(branches.find((branch) => branch.productUnitId === null)!.minimumQuantity.lte.eq(120)).toBe(true);
  });

  it("applies percentage promotions to the resolved selected-unit tier price", async () => {
    const { resolve } = fixture([tier("carton-tier", "carton", 5, 20000)], [promotion("ten-percent", "carton", 5, "PERCENTAGE", 10)]);
    const result = await resolve("carton", 5);
    expect(result.tierUnitPrice).toBe(20000);
    expect(result.promotionDiscount).toBe(2000);
    expect(result.finalUnitPrice).toBe(18000);
  });

  it("preserves single-unit retail pricing and generic base-unit tiers", async () => {
    const { resolve } = fixture([tier("five-pieces", null, 5, 900)]);
    expect((await resolve("piece", 1)).finalUnitPrice).toBe(1000);
    expect((await resolve("piece", 5)).finalUnitPrice).toBe(900);
  });

  it("uses selected Carton quantities for the shop Wholesale group only", async () => {
    const { resolve } = fixture([
      tier("retail-five", "carton", 5, 21_000),
      tier("wholesale-one", "carton", 1, 22_000, "wholesale"),
      tier("wholesale-five", "carton", 5, 20_500, "wholesale"),
      tier("wholesale-ten", "carton", 10, 19_500, "wholesale"),
    ]);
    expect((await resolve("carton", 7, "wholesale")).tierUnitPrice).toBe(20_500);
    expect((await resolve("carton", 12, "wholesale")).tierUnitPrice).toBe(19_500);
    expect((await resolve("carton", 5)).tierUnitPrice).toBe(21_000);
  });

  it("falls back to regular price rather than a Retail tier when Wholesale has no eligible tier", async () => {
    const { resolve } = fixture([tier("retail-one", "carton", 1, 21_000), tier("wholesale-five", "carton", 5, 20_500, "wholesale")]);
    const result = await resolve("carton", 2, "wholesale");
    expect(result.tierUnitPrice).toBeNull();
    expect(result.finalUnitPrice).toBe(24_000);
    expect(result.pricingType).toBe("WHOLESALE");
  });

  it("keeps Wholesale quantity thresholds conditional on the selected pricing context", async () => {
    const { resolve } = fixture([
      tier("ten", "piece", 10, 900, "wholesale"),
      tier("twenty", "piece", 20, 800, "wholesale"),
    ]);
    expect((await resolve("piece", 25)).finalUnitPrice).toBe(1000);
    expect((await resolve("piece", 5, "wholesale")).finalUnitPrice).toBe(1000);
    expect((await resolve("piece", 10, "wholesale")).finalUnitPrice).toBe(900);
    expect((await resolve("piece", 25, "wholesale")).finalUnitPrice).toBe(800);
  });

  it("ignores legacy generic Wholesale tiers without an explicit selling unit", async () => {
    const { resolve } = fixture([tier("generic-wholesale", null, 1, 700, "wholesale")]);
    const result = await resolve("carton", 5, "wholesale");
    expect(result.appliedTierId).toBeNull();
    expect(result.finalUnitPrice).toBe(24_000);
  });

  it("filters promotion audience and keeps one winning promotion", async () => {
    const { resolve } = fixture([], [
      { ...promotion("all", "carton", 1, "PERCENTAGE", 5), priority: 1, audienceType: "ALL" },
      { ...promotion("retail", "carton", 1, "PERCENTAGE", 10), priority: 2, audienceType: "RETAIL" },
      { ...promotion("wholesale", "carton", 1, "PERCENTAGE", 20), priority: 3, audienceType: "WHOLESALE" },
    ]);
    expect((await resolve("carton", 1)).promotionId).toBe("retail");
    expect((await resolve("carton", 1, "wholesale")).promotionId).toBe("wholesale");
  });

  it("applies an All Customers promotion to Retail and Wholesale contexts", async () => {
    const { resolve } = fixture([], [{ ...promotion("all", "piece", 1, "PERCENTAGE", 10), audienceType: "ALL" }]);
    expect((await resolve("piece", 1)).promotionId).toBe("all");
    expect((await resolve("piece", 1, "wholesale")).promotionId).toBe("all");
  });

  it("allows Wholesale-only promotion below any Wholesale tier and excludes the opposite audience", async () => {
    const { resolve } = fixture([tier("ten", "piece", 10, 900, "wholesale")], [
      { ...promotion("all", "piece", 1, "PERCENTAGE", 5), priority: 1, audienceType: "ALL" },
      { ...promotion("retail", "piece", 1, "PERCENTAGE", 10), priority: 2, audienceType: "RETAIL" },
      { ...promotion("wholesale", "piece", 1, "PERCENTAGE", 20), priority: 3, audienceType: "WHOLESALE" },
    ]);
    const walkIn = await resolve("piece", 1);
    expect(walkIn.promotionId).toBe("retail");
    const savedCustomer = await resolve("piece", 1, "wholesale");
    expect(savedCustomer.tierUnitPrice).toBeNull();
    expect(savedCustomer.promotionId).toBe("wholesale");
    expect(savedCustomer.finalUnitPrice).toBe(800);
  });
});
