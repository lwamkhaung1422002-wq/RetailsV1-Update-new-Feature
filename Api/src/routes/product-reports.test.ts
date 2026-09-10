import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ products: vi.fn(), sales: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    product: { findMany: mocks.products },
    orderItem: { groupBy: mocks.sales },
  },
}));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "user-1" }),
}));

import { productReportsRouter } from "./product-reports.routes.js";

const app = express();
app.use(productReportsRouter);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(400).json({ message: error.message });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sales.mockResolvedValue([]);
});

it("uses legacy inventory batches when a product has no inventory balance rows", async () => {
  mocks.products.mockResolvedValue([{
    id: "product-1",
    name: "Rice",
    sku: "RICE-1",
    category: null,
    barcodes: [],
    balances: [],
    inventory: [{ quantity: 5, baseQuantity: null }, { quantity: 2, baseQuantity: 4 }],
    cost: 1000,
    price: 1500,
    minimumStock: 3,
  }]);

  const result = await request(app).get("/shop-1/product-report").expect(200);

  expect(result.body.summary.totalProducts).toBe(1);
  expect(result.body.summary.totalQuantity).toBe(9);
  expect(result.body.products[0]).toMatchObject({ currentStock: 9, status: "IN_STOCK" });
});

it("keeps inventory balances authoritative after the inventory ledger exists", async () => {
  mocks.products.mockResolvedValue([{
    id: "product-1",
    name: "Rice",
    sku: "RICE-1",
    category: null,
    barcodes: [],
    balances: [{ onHand: 2 }],
    inventory: [{ quantity: 50, baseQuantity: 50 }],
    cost: 1000,
    price: 1500,
    minimumStock: 3,
  }]);

  const result = await request(app).get("/shop-1/product-report?from=2026-09-09&to=2026-09-09").expect(200);

  expect(result.body.products[0]).toMatchObject({ currentStock: 2, status: "LOW_STOCK" });
  expect(mocks.sales).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      order: expect.objectContaining({ createdAt: expect.objectContaining({ gte: expect.any(Date), lte: expect.any(Date) }) }),
    }),
  }));
  const salesCall = mocks.sales.mock.calls[0]![0];
  expect(salesCall.where.order.createdAt.lte.getTime() - salesCall.where.order.createdAt.gte.getTime()).toBe(86_400_000 - 1);
});

it("keeps zero-sale products out of slow sellers and returns them as no sales", async () => {
  mocks.products.mockResolvedValue([
    { id: "sold-1", name: "Rice", sku: "RICE", category: null, barcodes: [], balances: [{ onHand: 8 }], inventory: [], cost: 1000, price: 1500, minimumStock: 2 },
    { id: "sold-2", name: "Water", sku: "WATER", category: null, barcodes: [], balances: [{ onHand: 12 }], inventory: [], cost: 500, price: 800, minimumStock: 2 },
    { id: "no-sale", name: "Sugar", sku: "SUGAR", category: null, barcodes: [], balances: [{ onHand: 6 }], inventory: [], cost: 900, price: 1200, minimumStock: 2 },
  ]);
  mocks.sales.mockResolvedValue([
    { productId: "sold-1", _sum: { quantity: 5, lineTotal: 7500 } },
    { productId: "sold-2", _sum: { quantity: 2, lineTotal: 1600 } },
  ]);

  const result = await request(app).get("/shop-1/product-report").expect(200);

  expect(result.body.slowSellers.map((row: { id: string }) => row.id)).toEqual(["sold-2", "sold-1"]);
  expect(result.body.noSales.map((row: { id: string }) => row.id)).toEqual(["no-sale"]);
});
