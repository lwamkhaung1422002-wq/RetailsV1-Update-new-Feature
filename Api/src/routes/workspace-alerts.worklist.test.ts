import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), orders: vi.fn(), deliveries: vi.fn(), expenses: vi.fn(), payments: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: {
  order: { findMany: mocks.orders },
  supplierDeliveryRecord: { findMany: mocks.deliveries },
  expense: { findMany: mocks.expenses },
  payment: { findMany: mocks.payments },
} }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: mocks.access }));
vi.mock("../middleware/auth.middleware.js", () => ({ requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(), getAuthUser: () => ({ id: "user-1" }) }));

import { workspaceAlertsRouter } from "./workspace-alerts.routes.js";

const app = express();
app.use(workspaceAlertsRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deliveries.mockResolvedValue([]);
  mocks.expenses.mockResolvedValue([]);
  mocks.payments.mockResolvedValue([]);
});

it("extends the existing worklist with customer credit fields and authoritative scoped balance", async () => {
  mocks.orders.mockResolvedValue([{
    id: "order-1", orderNumber: "INV-1", customerId: "customer-1", customer: { name: "ABC Store" },
    dueAt: new Date("2026-09-26T17:30:00.000Z"), paymentTracking: true, cancelledAt: null,
    fulfillmentStatus: "reserved", total: 1000, subtotal: 1000, discount: 0, deliveryFee: 0, createdAt: new Date("2026-09-20T00:00:00.000Z"),
    items: [{ id: "item-1", quantity: 1, baseQuantity: 1, lineTotal: 1000, returns: [] }],
    payments: [{ id: "direct-1", amount: 200, method: "Cash", paidAt: new Date("2026-09-20T00:00:00.000Z"), createdAt: new Date("2026-09-20T00:00:00.000Z"), originalPaymentId: null }],
  }]);
  mocks.payments.mockResolvedValue([{ amount: 300, type: "payment", scope: "COD", allocations: JSON.stringify([{ orderId: "order-1", amount: 300 }]) }]);

  const response = await request(app).get("/shop-1/payment-history?view=worklist").expect(200);
  expect(response.body.records).toHaveLength(1);
  expect(response.body.records[0]).toMatchObject({
    kind: "sale", apiId: "order-1", id: "INV-1", customerId: "customer-1", customerName: "ABC Store", paymentTracking: true,
    status: "Partial", amount: 1000, remainingAmount: 500, dueAt: "2026-09-26T17:30:00.000Z",
  });
  expect(mocks.orders).toHaveBeenCalledWith(expect.objectContaining({ where: { shopId: "shop-1", paymentTracking: true } }));
  expect(mocks.access).toHaveBeenCalledWith("user-1", "shop-1");
});
