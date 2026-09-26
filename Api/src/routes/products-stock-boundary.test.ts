import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findProduct: vi.fn(), batchCount: vi.fn(), movementCount: vi.fn(), balanceCount: vi.fn(), reservationCount: vi.fn(), orderCount: vi.fn(), purchaseCount: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: {
  product: { findFirst: mocks.findProduct },
  inventoryBatch: { count: mocks.batchCount }, inventoryMovement: { count: mocks.movementCount },
  inventoryBalance: { count: mocks.balanceCount }, inventoryReservation: { count: mocks.reservationCount },
  orderItem: { count: mocks.orderCount }, purchaseItem: { count: mocks.purchaseCount },
} }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "owner-1", email: "owner@example.com" }),
}));

import { productsRouter } from "./products.routes.js";

const app = express();
app.use(express.json());
app.use(productsRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findProduct.mockResolvedValue({ id: "product-1", balances: [], barcodes: [], _count: { orderItems: 0 } });
  for (const count of [mocks.batchCount, mocks.movementCount, mocks.balanceCount, mocks.reservationCount, mocks.orderCount, mocks.purchaseCount]) count.mockResolvedValue(0);
});

describe("product stock ownership boundary", () => {
  it("rejects stock quantity changes through product metadata editing", async () => {
    const result = await request(app).patch("/shop-1/products/product-1").send({ name: "Coffee", stockQuantity: 12 }).expect(400);
    expect(result.body.message).toBe("Stock quantity must be changed through inventory movements.");
  });

  it("leaves an unused product base unit unlocked", async () => {
    const result = await request(app).get("/shop-1/products/product-1").expect(200);
    expect(result.body.baseUnitLocked).toBe(false);
  });

  it.each(["batchCount", "movementCount", "balanceCount", "reservationCount", "orderCount", "purchaseCount"] as const)("locks the base unit when %s has history", async (countName) => {
    mocks[countName].mockResolvedValue(1);
    const result = await request(app).get("/shop-1/products/product-1").expect(200);
    expect(result.body.baseUnitLocked).toBe(true);
  });
});
