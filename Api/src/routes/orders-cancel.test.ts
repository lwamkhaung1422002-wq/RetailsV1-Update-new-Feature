import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: { $transaction: async (run: (tx: unknown) => unknown) => run({ order: { findFirst: mocks.findFirst, update: mocks.update } }) } }));
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
beforeEach(() => { vi.clearAllMocks(); mocks.update.mockResolvedValue({ id: "order-1", fulfillmentStatus: "cancelled" }); });
it("rejects cancellation with even one active payment before changing stock or order", async () => {
  mocks.findFirst.mockResolvedValue({ id: "order-1", total: 10000, fulfillmentStatus: "completed", items: [], payments: [{ id: "pay-1", amount: 5000 }] });
  const result = await request(app).post("/shop-1/orders/order-1/cancel").send({ reason: "Wrong order" }).expect(400);
  expect(result.body.message).toMatch(/Cancel active payment records/);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.audit).not.toHaveBeenCalled();
});
it("keeps the order as cancelled after all payments are reversed", async () => {
  mocks.findFirst.mockResolvedValue({ id: "order-1", total: 10000, fulfillmentStatus: "completed", items: [], payments: [{ id: "pay-1", amount: 5000 }, { id: "refund-1", originalPaymentId: "pay-1", amount: -5000 }] });
  await request(app).post("/shop-1/orders/order-1/cancel").send({ reason: "Wrong order" }).expect(200);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1" }, data: expect.objectContaining({ fulfillmentStatus: "cancelled", cancelReason: "Wrong order" }) }));
});
it("cancels a fully paid order directly without requiring a refund", async () => {
  mocks.findFirst.mockResolvedValue({ id: "order-1", total: 5000, fulfillmentStatus: "completed", items: [], payments: [{ id: "pay-1", amount: 5000 }] });
  await request(app).post("/shop-1/orders/order-1/cancel").send({ reason: "Wrong order" }).expect(200);
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "order-1" }, data: expect.objectContaining({ fulfillmentStatus: "cancelled", cancelReason: "Wrong order" }) }));
});
