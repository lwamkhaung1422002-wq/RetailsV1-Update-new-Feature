import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), paymentCreate: vi.fn(), audit: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: { $transaction: async (run: (tx: unknown) => unknown) => run({ order: { findFirst: mocks.findFirst, update: mocks.update }, payment: { create: mocks.paymentCreate } }) } }));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../lib/manager-approval.js", () => ({
  approvalAccessToken: () => undefined,
  approvalAuditMetadata: () => ({}),
  authorizeSensitiveAction: vi.fn().mockResolvedValue({ actorRole: "OWNER", authorizationMode: "direct" }),
  consumeManagerApproval: vi.fn(),
}));
vi.mock("../middleware/auth.middleware.js", () => ({ requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(), getAuthUser: () => ({ id: "user-1" }) }));
import { ordersRouter } from "./orders.routes.js";
const app = express();
app.use(express.json());
app.use((req, _res, next) => { Object.assign(req, { log: { info: vi.fn() } }); next(); });
app.use(ordersRouter);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(400).json({ message: error.message }); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.paymentCreate.mockImplementation(async ({ data }) => ({ id: "refund-1", ...data }));
  mocks.update.mockResolvedValue({ id: "order-1", total: 10000, subtotal: 10000, discount: 0, items: [], payments: [], fulfillmentStatus: "cancelled" });
});
it("keeps the refund stage for a tracked sale with an active payment", async () => {
  mocks.findFirst.mockResolvedValue({ id: "order-1", total: 10000, subtotal: 10000, discount: 0, paymentTracking: true, fulfillmentStatus: "completed", items: [], payments: [{ id: "pay-1", amount: 5000, method: "Cash" }] });
  const result = await request(app).post("/shop-1/orders/order-1/cancel").send({ reason: "Wrong order" }).expect(400);
  expect(result.body.message).toMatch(/Cancel active payment records/);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});
it("keeps the order as cancelled after all payments are reversed", async () => {
  mocks.findFirst.mockResolvedValue({ id: "order-1", total: 10000, subtotal: 10000, discount: 0, paymentTracking: true, fulfillmentStatus: "completed", items: [], payments: [{ id: "pay-1", amount: 5000, method: "Cash" }, { id: "refund-1", originalPaymentId: "pay-1", amount: -5000, method: "Cash" }] });
  await request(app).post("/shop-1/orders/order-1/cancel").send({ reason: "Wrong order" }).expect(200);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1" }, data: expect.objectContaining({ fulfillmentStatus: "cancelled", cancelReason: "Wrong order" }) }));
});
it("automatically refunds and cancels an untracked paid order", async () => {
  mocks.findFirst.mockResolvedValue({ id: "order-1", total: 5000, subtotal: 5000, discount: 0, paymentTracking: false, fulfillmentStatus: "completed", items: [], payments: [{ id: "pay-1", amount: 5000, method: "Cash" }] });
  await request(app).post("/shop-1/orders/order-1/cancel").send({ reason: "Wrong order" }).expect(200);
  expect(mocks.paymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: -5000, originalPaymentId: "pay-1", scope: "order-cancel" }) });
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1" }, data: expect.objectContaining({ fulfillmentStatus: "cancelled", cancelReason: "Wrong order" }) }));
});

it("refunds only the current net balance after an earlier return refund", async () => {
  mocks.findFirst.mockResolvedValue({
    id: "order-1", total: 100_000, subtotal: 100_000, discount: 0,
    paymentTracking: false, fulfillmentStatus: "completed", items: [],
    payments: [
      { id: "pay-1", amount: 100_000, method: "Cash" },
      { id: "return-refund", amount: -30_000, method: "Cash", originalPaymentId: "pay-1" },
    ],
  });
  await request(app).post("/shop-1/orders/order-1/cancel").send({ reason: "Final cancellation" }).expect(200);
  expect(mocks.paymentCreate).toHaveBeenCalledTimes(1);
  expect(mocks.paymentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: -70_000, originalPaymentId: "pay-1" }) });
});
