import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFind: vi.fn(),
  deliveryFind: vi.fn(),
  deliveryCreate: vi.fn(),
  deliveryUpdate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: mocks.userFind },
    supplierDeliveryRecord: { findFirst: mocks.deliveryFind, update: mocks.deliveryUpdate },
    $transaction: (run: (tx: unknown) => unknown) => run({
      user: { findUnique: mocks.userFind },
      supplierDeliveryRecord: { create: mocks.deliveryCreate, findFirst: mocks.deliveryFind, update: mocks.deliveryUpdate },
    }),
  },
}));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/shop-access.js", () => ({ assertUserOwnsShop: vi.fn() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "staff-b" }),
}));

import { purchasesRouter } from "./purchases.routes.js";

const app = express();
app.use(express.json());
app.use(purchasesRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

const body = {
  name: "Golden Supply",
  phone: "091234567",
  deliveryRecord: {
    invoiceNumber: "INV-1",
    deliveryName: "Truck 1",
    deliveryPhone: "099999999",
    receivedAt: "2026-09-20",
    dueAt: "2026-09-30",
    amount: 50_000,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFind.mockResolvedValue({ name: "Staff B" });
  mocks.deliveryFind.mockImplementation(async ({ where }) => where.id ? ({ id: "delivery-1", receiverName: "Staff A", status: "active", amount: 50_000, payments: [] }) : null);
  mocks.deliveryCreate.mockImplementation(async ({ data }) => ({ id: "delivery-1", ...data }));
  mocks.deliveryUpdate.mockImplementation(async ({ data }) => ({ id: "delivery-1", receiverName: "Staff A", ...data }));
});

describe("supplier delivery Recorded By", () => {
  it("persists the authenticated creator name and ignores frontend creator ownership", async () => {
    const result = await request(app).post("/shop-1/suppliers").send({ ...body, receiverName: "Forged", deliveryRecord: { ...body.deliveryRecord, receiverName: "Forged" } }).expect(201);
    expect(mocks.userFind).toHaveBeenCalledWith({ where: { id: "staff-b" }, select: { name: true } });
    expect(mocks.deliveryCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ receiverName: "Staff B" }) });
    expect(result.body.record.receiverName).toBe("Staff B");
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorId: "staff-b" }));
  });

  it("fails clearly when the authenticated creator name cannot be resolved", async () => {
    mocks.userFind.mockResolvedValue(null);
    const result = await request(app).post("/shop-1/suppliers").send(body).expect(400);
    expect(result.body.message).toMatch(/creator name could not be resolved/i);
    expect(mocks.deliveryCreate).not.toHaveBeenCalled();
  });

  it("preserves the original creator snapshot when another staff member edits", async () => {
    await request(app).patch("/shop-1/supplier-delivery-records/delivery-1").send({ ...body, deliveryRecord: { ...body.deliveryRecord, invoiceNumber: "INV-2" } }).expect(200);
    expect(mocks.deliveryUpdate).toHaveBeenCalled();
    const updateData = mocks.deliveryUpdate.mock.calls[0]![0].data;
    expect(updateData).not.toHaveProperty("receiverName");
  });
});
