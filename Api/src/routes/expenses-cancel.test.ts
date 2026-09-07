import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), updateMany: vi.fn(), audit: vi.fn() }));
vi.mock("../lib/prisma.js", () => ({ prisma: {
  expense: { findFirst: mocks.findFirst },
  $transaction: async (run: (tx: unknown) => unknown) => run({ expense: { updateMany: mocks.updateMany } }),
} }));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "user-1" }),
}));
import { expensesRouter } from "./expenses.routes.js";

const app = express();
app.use(express.json(), expensesRouter);
beforeEach(() => { vi.clearAllMocks(); mocks.findFirst.mockResolvedValue({ id: "entry-1" }); });
it("marks the scoped record cancelled without deleting it", async () => {
  mocks.updateMany.mockResolvedValue({ count: 1 });
  await request(app).delete("/shop-1/expenses/entry-1").expect(204);
  expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "entry-1", shopId: "shop-1", cancelledAt: null }, data: { cancelledAt: expect.any(Date) } });
  expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "expense.cancel", entityId: "entry-1" }));
});
it("does not create a second cancellation audit on repeated requests", async () => {
  mocks.updateMany.mockResolvedValue({ count: 0 });
  await request(app).delete("/shop-1/expenses/entry-1").expect(204);
  expect(mocks.audit).not.toHaveBeenCalled();
});
