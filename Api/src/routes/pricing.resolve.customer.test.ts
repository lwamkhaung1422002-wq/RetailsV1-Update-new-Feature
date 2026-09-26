import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customerFind: vi.fn(), groupFind: vi.fn(), groupUpsert: vi.fn(), resolve: vi.fn(),
}));
vi.mock("../lib/prisma.js", () => ({ prisma: {
  customer: { findFirst: mocks.customerFind },
  customerPriceGroup: { findUnique: mocks.groupFind, upsert: mocks.groupUpsert },
} }));
vi.mock("../lib/pricing-domain.js", () => ({ resolvePrice: mocks.resolve }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
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
  mocks.resolve.mockResolvedValue({ finalUnitPrice: 1000 });
  mocks.customerFind.mockResolvedValue({ id: "legacy-customer" });
  mocks.groupFind.mockResolvedValue({ id: "wholesale-group" });
  mocks.groupUpsert.mockResolvedValue({ id: "wholesale-group" });
});

describe("customer-aware pricing resolve", () => {
  it("uses Retail context when no saved customer is selected", async () => {
    await request(app).post("/shop-1/pricing/resolve").send({ productId: "product-1", quantity: 10, customerId: null, priceGroupId: "stale-group" }).expect(200);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), "shop-1", expect.objectContaining({ priceGroupId: null }));
    expect(mocks.customerFind).not.toHaveBeenCalled();
    expect(mocks.groupFind).not.toHaveBeenCalled();
  });

  it("derives the canonical Wholesale group for a legacy customer without writing it again", async () => {
    await request(app).post("/shop-1/pricing/resolve").send({ productId: "product-1", quantity: 10, customerId: "legacy-customer", priceGroupId: "stale-group" }).expect(200);
    expect(mocks.customerFind).toHaveBeenCalledWith({ where: { id: "legacy-customer", shopId: "shop-1" }, select: { id: true } });
    expect(mocks.groupFind).toHaveBeenCalledWith({ where: { shopId_name: { shopId: "shop-1", name: "Wholesale" } }, select: { id: true } });
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), "shop-1", expect.objectContaining({ priceGroupId: "wholesale-group" }));
    expect(mocks.groupUpsert).not.toHaveBeenCalled();
  });

  it("rejects a customer outside the shop", async () => {
    mocks.customerFind.mockResolvedValue(null);
    const result = await request(app).post("/shop-1/pricing/resolve").send({ productId: "product-1", customerId: "other-shop-customer" }).expect(400);
    expect(result.body.message).toMatch(/Customer not found/);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("retains direct priceGroupId compatibility for callers without customerId", async () => {
    await request(app).post("/shop-1/pricing/resolve").send({ productId: "product-1", priceGroupId: "other-group" }).expect(200);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), "shop-1", expect.objectContaining({ priceGroupId: "other-group" }));
  });

  it("creates the canonical group only when it is missing", async () => {
    mocks.groupFind.mockResolvedValue(null);
    await request(app).post("/shop-1/pricing/resolve").send({ productId: "product-1", customerId: "legacy-customer" }).expect(200);
    expect(mocks.groupUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.resolve).toHaveBeenCalledWith(expect.anything(), "shop-1", expect.objectContaining({ priceGroupId: "wholesale-group" }));
  });
});
