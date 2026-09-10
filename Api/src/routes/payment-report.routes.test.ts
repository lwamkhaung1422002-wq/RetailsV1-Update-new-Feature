import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  shop: vi.fn(),
  payments: vi.fn(),
  audits: vi.fn(),
  orders: vi.fn(),
  users: vi.fn(),
}));
vi.mock("../lib/prisma.js", () => ({ prisma: {
  shop: { findUniqueOrThrow: mocks.shop },
  payment: { findMany: mocks.payments },
  auditLog: { findMany: mocks.audits },
  order: { findMany: mocks.orders },
  user: { findMany: mocks.users },
} }));
vi.mock("../lib/shop-access.js", () => ({ assertShopPermission: mocks.access }));
vi.mock("../middleware/auth.middleware.js", () => ({ requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(), getAuthUser: () => ({ id: "user-1" }) }));

import { paymentReportRouter } from "./payment-report.routes.js";

const app = express();
app.use(express.json());
app.use(paymentReportRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

describe("payment report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const cash = { id: "pay-1", shopId: "branch-2", orderId: "order-1", type: "payment", scope: "order-payment", method: "Cash", amount: 100_000, originalPaymentId: null, paidAt: new Date("2026-09-10T03:00:00.000Z") };
    const refund = { id: "refund-1", shopId: "branch-2", orderId: "order-1", type: "refund", scope: "financial-refund", method: "Cash", amount: -20_000, originalPaymentId: "pay-1", paidAt: new Date("2026-09-10T04:00:00.000Z") };
    const wallet = { id: "pay-2", shopId: "branch-2", orderId: "order-2", type: "payment", scope: "order-payment", method: "KBZPay", amount: 50_000, originalPaymentId: null, paidAt: new Date("2026-09-10T05:00:00.000Z") };
    mocks.shop.mockResolvedValue({ id: "branch-2", name: "Hledan" });
    mocks.payments.mockResolvedValueOnce([cash, refund, wallet]).mockResolvedValueOnce([refund, cash, wallet]);
    mocks.audits.mockResolvedValue([
      { entityId: "refund-1", actorId: "staff-1", metadata: { approvedById: "manager-1" }, createdAt: new Date() },
      { entityId: "pay-1", actorId: "staff-1", metadata: {}, createdAt: new Date() },
      { entityId: "pay-2", actorId: "staff-2", metadata: {}, createdAt: new Date() },
    ]);
    mocks.orders.mockResolvedValue([{ id: "order-1", total: 100_000, completedAt: new Date("2026-09-10T02:00:00.000Z"), items: [], payments: [{ amount: 100_000, type: "payment", scope: "order-payment" }, { amount: -20_000, type: "refund", scope: "financial-refund" }] }]);
    mocks.users.mockResolvedValue([{ id: "staff-1", name: "Cashier" }, { id: "staff-2", name: "Other" }, { id: "manager-1", name: "Manager" }]);
  });

  it("filters by authorized branch, method, and proven staff attribution", async () => {
    const result = await request(app).get("/main/reports/payments?branchId=branch-2&from=2026-09-10&to=2026-09-10&method=Cash&staffId=staff-1").expect(200);
    expect(mocks.access).toHaveBeenCalledWith("user-1", "branch-2", "report.viewSales");
    expect(result.body.summary).toEqual({ collected: 100_000, refunds: 20_000, netCollected: 80_000, outstanding: 20_000 });
    expect(result.body.methods).toEqual([{ method: "Cash", collected: 100_000, refunds: 20_000, netCollected: 80_000 }]);
    expect(result.body.recent).toHaveLength(2);
    expect(result.body.recent[0].approver).toEqual({ id: "manager-1", name: "Manager" });
  });
});
