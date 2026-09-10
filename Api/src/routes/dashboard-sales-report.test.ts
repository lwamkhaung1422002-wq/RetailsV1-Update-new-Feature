import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ orders: vi.fn(), payments: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    order: { findMany: mocks.orders },
    payment: { findMany: mocks.payments },
  },
}));
vi.mock("../lib/shop-access.js", () => ({
  SHOP_PERMISSIONS: [],
  assertShopAccess: vi.fn().mockResolvedValue({ shopId: "shop-1", role: "OWNER", permissions: [], isOwner: true }),
  hasShopPermission: vi.fn().mockReturnValue(true),
}));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "user-1" }),
}));

import { dashboardRouter } from "./dashboard.routes.js";

const app = express();
app.use(dashboardRouter);
app.use((error: Error, _req: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(400).json({ message: error.message });
});

const completedAt = new Date("2026-09-10T03:30:00.000Z");
const order = {
  id: "order-1",
  total: 100_000,
  fulfillmentStatus: "completed",
  completedAt,
  items: [{
    quantity: 1,
    baseQuantity: null,
    unitCost: 60_000,
    lineTotal: 100_000,
    recognizedAt: completedAt,
    product: { category: { name: "Retail" } },
  }],
};
const payment = {
  id: "payment-1",
  orderId: order.id,
  orderIds: null,
  allocations: null,
  originalPaymentId: null,
  type: "payment",
  scope: "order-payment",
  method: "Cash",
  amount: 100_000,
  paidAt: completedAt,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.orders.mockResolvedValue([order]);
  mocks.payments.mockResolvedValue([payment]);
});

it("subtracts a negative refund once from collections and canonical gross profit", async () => {
  mocks.payments.mockResolvedValue([
    payment,
    {
      ...payment,
      id: "refund-1",
      originalPaymentId: payment.id,
      type: "refund",
      scope: "financial-refund",
      amount: -20_000,
    },
  ]);

  const result = await request(app)
    .get("/shop-1/reports/sales?from=2026-09-10&to=2026-09-10")
    .expect(200);

  expect(result.body.collectionTotal).toBe(80_000);
  expect(result.body.paymentCollections).toEqual([
    expect.objectContaining({ method: "Cash", amount: 80_000 }),
  ]);
  expect(result.body.summary.totalSales.current).toBe(100_000);
  expect(result.body.summary.totalCostPrice.current).toBe(60_000);
  expect(result.body.summary.grossProfit.current).toBe(20_000);
});

it("keeps gross profit unchanged when there is no refund", async () => {
  const result = await request(app)
    .get("/shop-1/reports/sales?from=2026-09-10&to=2026-09-10")
    .expect(200);

  expect(result.body.collectionTotal).toBe(100_000);
  expect(result.body.summary.grossProfit.current).toBe(40_000);
});
