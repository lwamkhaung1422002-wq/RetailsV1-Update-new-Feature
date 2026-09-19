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

function usePayments(all: Array<Record<string, unknown>>, period = all) {
  mocks.payments.mockReset();
  mocks.payments.mockResolvedValueOnce(all).mockResolvedValueOnce(period);
}

describe("payment report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const cash = { id: "pay-1", shopId: "branch-2", orderId: "order-1", order: { id: "order-1", orderNumber: "INV-00025" }, type: "payment", scope: "order-payment", method: "Cash", amount: 100_000, originalPaymentId: null, paidAt: new Date("2026-09-10T03:00:00.000Z") };
    const refund = { id: "refund-1", shopId: "branch-2", orderId: "order-1", order: { id: "order-1", orderNumber: "INV-00025" }, type: "refund", scope: "financial-refund", method: "Cash", amount: -20_000, originalPaymentId: "pay-1", paidAt: new Date("2026-09-10T04:00:00.000Z") };
    const wallet = { id: "pay-2", shopId: "branch-2", orderId: "order-2", order: { id: "order-2", orderNumber: "INV-00026" }, type: "payment", scope: "order-payment", method: "KBZPay", amount: 50_000, originalPaymentId: null, paidAt: new Date("2026-09-10T05:00:00.000Z") };
    mocks.shop.mockResolvedValue({ id: "branch-2", name: "Hledan" });
    usePayments([cash, refund, wallet], [refund, cash, wallet]);
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
    expect(result.body.recent[0]).toMatchObject({ type: "Refund", source: "Sale Invoice #INV-00025" });
  });

  it.each([
    {
      name: "more expensive exchange",
      payments: [
        { id: "difference", exchangeId: "exchange-1", type: "payment", scope: "exchange-difference", method: "Cash", amount: 10_000 },
        { id: "credit", exchangeId: "exchange-1", type: "payment", scope: "exchange-credit", method: "Exchange Credit", amount: 30_000 },
        { id: "return", exchangeId: "exchange-1", type: "refund", scope: "exchange-return", method: "Cash", amount: -30_000 },
      ],
      summary: { collected: 10_000, refunds: 0, netCollected: 10_000 },
      status: [{ status: "Collected", count: 1, amount: 10_000 }, { status: "Refunded", count: 0, amount: 0 }],
      recentId: "difference",
      recentAmount: 10_000,
    },
    {
      name: "cheaper exchange",
      payments: [
        { id: "credit", exchangeId: "exchange-1", type: "payment", scope: "exchange-credit", method: "Exchange Credit", amount: 30_000 },
        { id: "return", exchangeId: "exchange-1", type: "refund", scope: "exchange-return", method: "Cash", amount: -40_000 },
      ],
      summary: { collected: 0, refunds: 10_000, netCollected: -10_000 },
      status: [{ status: "Collected", count: 0, amount: 0 }, { status: "Refunded", count: 1, amount: 10_000 }],
      recentId: "return",
      recentAmount: -10_000,
    },
    {
      name: "equal-value exchange",
      payments: [
        { id: "credit", exchangeId: "exchange-1", type: "payment", scope: "exchange-credit", method: "Exchange Credit", amount: 30_000 },
        { id: "return", exchangeId: "exchange-1", type: "refund", scope: "exchange-return", method: "Cash", amount: -30_000 },
      ],
      summary: { collected: 0, refunds: 0, netCollected: 0 },
      status: [{ status: "Collected", count: 0, amount: 0 }, { status: "Refunded", count: 0, amount: 0 }],
      recentId: null,
      recentAmount: 0,
    },
  ])("reports cash truth for $name across summary, methods, statuses, and recent", async ({ payments, summary, status, recentId, recentAmount }) => {
    const dated = payments.map((payment) => ({ ...payment, shopId: "branch-2", orderId: "order-1", originalPaymentId: null, paidAt: new Date("2026-09-10T03:00:00.000Z") }));
    usePayments(dated);
    mocks.audits.mockResolvedValue(dated.map((payment) => ({ entityId: payment.id, actorId: "staff-1", metadata: {}, createdAt: payment.paidAt })));

    const result = await request(app).get("/branch-2/reports/payments?from=2026-09-10&to=2026-09-10&method=Cash&staffId=staff-1").expect(200);

    expect(result.body.summary).toMatchObject(summary);
    expect(result.body.methods).toEqual(recentId ? [{ method: "Cash", ...summary }] : []);
    expect(result.body.statuses).toEqual(status);
    expect(result.body.recent).toHaveLength(recentId ? 1 : 0);
    if (recentId) expect(result.body.recent[0]).toMatchObject({ id: recentId, method: "Cash", amount: recentAmount, actor: { id: "staff-1", name: "Cashier" } });
    expect(result.body.methods.some((entry: { method: string }) => entry.method === "Exchange Credit")).toBe(false);
    expect(result.body.recent.some((entry: { method: string }) => entry.method === "Exchange Credit")).toBe(false);
  });
});
