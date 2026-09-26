import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  productFind: vi.fn(), groupFind: vi.fn(), groupUpsert: vi.fn(), tiersFind: vi.fn(), tiersDelete: vi.fn(), tierCreate: vi.fn(), tierUpdate: vi.fn(),
  permissions: new Set(["price.edit"]),
}));
vi.mock("../lib/prisma.js", () => ({ prisma: {
  product: { findFirst: mocks.productFind },
  customerPriceGroup: { findFirst: mocks.groupFind, upsert: mocks.groupUpsert },
  priceTier: { findMany: mocks.tiersFind, deleteMany: mocks.tiersDelete, create: mocks.tierCreate, update: mocks.tierUpdate },
  $transaction: async (run: (tx: unknown) => unknown) => run({
    product: { findFirst: mocks.productFind }, customerPriceGroup: { findFirst: mocks.groupFind, upsert: mocks.groupUpsert },
    priceTier: { findMany: mocks.tiersFind, deleteMany: mocks.tiersDelete, create: mocks.tierCreate, update: mocks.tierUpdate },
  }),
} }));
vi.mock("../lib/shop-access.js", () => ({
  assertUserOwnsShop: vi.fn(),
  assertShopPermission: async (_userId: string, _shopId: string, permission: string) => {
    if (!mocks.permissions.has(permission)) throw Object.assign(new Error("You do not have permission for this action."), { name: "ForbiddenError" });
  },
}));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "owner-1" }),
}));

import { pricingRouter } from "./pricing.routes.js";

const app = express();
app.use(express.json());
app.use(pricingRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions = new Set(["price.edit"]);
  mocks.productFind.mockResolvedValue({ id: "product-1", shopId: "shop-1", cost: 1_000, variants: [], units: [{ id: "carton-unit", unitId: "carton", conversionFactor: "24", canSell: true, unit: { isActive: true } }] });
  mocks.groupFind.mockResolvedValue({ id: "wholesale-group" });
  mocks.groupUpsert.mockResolvedValue({ id: "wholesale-group" });
  mocks.tiersFind.mockResolvedValue([]);
  mocks.tierCreate.mockResolvedValue({});
  mocks.tiersDelete.mockResolvedValue({ count: 0 });
});

describe("Wholesale Pricing API", () => {
  it("requires price.edit for Wholesale pricing writes", async () => {
    mocks.permissions = new Set();
    await request(app).put("/shop-1/wholesale-pricing/product-1").send({ productUnitId: "carton-unit", levels: [{ minimumQuantity: 1, unitPrice: 26_000 }] }).expect(400);
    expect(mocks.groupUpsert).not.toHaveBeenCalled();
    expect(mocks.tierCreate).not.toHaveBeenCalled();
  });
  it("reads only the system Wholesale group's explicit selling-unit tiers", async () => {
    await request(app).get("/shop-1/wholesale-pricing/product-1").expect(200);
    expect(mocks.tiersFind).toHaveBeenCalledWith(expect.objectContaining({ where: { productId: "product-1", priceGroupId: "wholesale-group", productUnitId: { not: null } } }));
  });

  it("saves multiple quantity levels for a selected selling unit", async () => {
    await request(app).put("/shop-1/wholesale-pricing/product-1").send({ productUnitId: "carton-unit", levels: [
      { minimumQuantity: 1, unitPrice: 26_000 }, { minimumQuantity: 5, unitPrice: 25_000 },
    ] }).expect(200);
    expect(mocks.groupUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { shopId_name: { shopId: "shop-1", name: "Wholesale" } } }));
    expect(mocks.tierCreate).toHaveBeenCalledTimes(2);
    expect(mocks.tierCreate).toHaveBeenCalledWith({ data: { productId: "product-1", variantId: null, productUnitId: "carton-unit", priceGroupId: "wholesale-group", minimumQuantity: 5, unitPrice: 25_000 } });
  });

  it("rejects duplicate levels, below-cost prices, and inactive selling units", async () => {
    await request(app).put("/shop-1/wholesale-pricing/product-1").send({ productUnitId: "carton-unit", levels: [
      { minimumQuantity: 1, unitPrice: 26_000 }, { minimumQuantity: 1, unitPrice: 25_000 },
    ] }).expect(400);
    const below = await request(app).put("/shop-1/wholesale-pricing/product-1").send({ productUnitId: "carton-unit", levels: [{ minimumQuantity: 1, unitPrice: 23_999 }] }).expect(400);
    expect(below.body.message).toMatch(/lower than the product cost/);
    mocks.productFind.mockResolvedValue({ id: "product-1", shopId: "shop-1", cost: 1_000, variants: [], units: [{ id: "carton-unit", canSell: false, unit: { isActive: true } }] });
    await request(app).put("/shop-1/wholesale-pricing/product-1").send({ productUnitId: "carton-unit", levels: [{ minimumQuantity: 1, unitPrice: 26_000 }] }).expect(400);
    expect(mocks.tierCreate).not.toHaveBeenCalled();
  });
});
