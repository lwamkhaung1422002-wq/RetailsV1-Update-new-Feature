import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orderFind: vi.fn(),
  orderUpdate: vi.fn(),
  paymentFind: vi.fn(),
  paymentCreate: vi.fn(),
  audit: vi.fn(),
  access: vi.fn(),
}));

const tx = {
  order: { findFirst: mocks.orderFind, update: mocks.orderUpdate },
  payment: { findMany: mocks.paymentFind, findFirst: vi.fn(), create: mocks.paymentCreate },
};
vi.mock("../lib/prisma.js", () => ({ prisma: { $transaction: (run: (client: typeof tx) => unknown) => run(tx) } }));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: mocks.access }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "cashier-1" }),
}));

import { paymentsRouter } from "./payments.routes.js";

const app = express();
app.use(express.json());
app.use(paymentsRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

describe("payment route canonical balance reuse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orderFind
      .mockResolvedValueOnce({ id: "order-1", total: 90_000, paymentStatus: "partial", fulfillmentStatus: "completed" })
      .mockResolvedValueOnce({ id: "order-1", total: 90_000 });
    mocks.paymentFind
      .mockResolvedValueOnce([{ amount: 40_000 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ amount: 40_000 }, { amount: 50_000 }])
      .mockResolvedValueOnce([]);
    mocks.paymentCreate.mockResolvedValue({ id: "payment-2", orderId: "order-1", amount: 50_000, method: "Cash", orderIds: null, allocations: null });
    mocks.orderUpdate.mockResolvedValue({ id: "order-1", total: 90_000, paymentStatus: "paid" });
  });

  it("keeps direct remaining-balance collection and status behavior unchanged", async () => {
    const result = await request(app).post("/shop-1/orders/order-1/payments").send({ method: "Cash" }).expect(201);

    expect(mocks.paymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: "order-1", amount: 50_000, scope: "credit-settlement", method: "Cash" }) });
    expect(mocks.orderUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1" }, data: { paymentStatus: "paid" } }));
    expect(result.body.payment).toMatchObject({ amount: 50_000, method: "Cash" });
  });
});
