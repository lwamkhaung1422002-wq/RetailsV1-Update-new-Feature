import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertShopAccess: vi.fn(),
  compare: vi.fn(),
  findShop: vi.fn(),
  findMember: vi.fn(),
  createApprovalToken: vi.fn(),
  fingerprint: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("bcrypt", () => ({ default: { compare: mocks.compare, hash: vi.fn() } }));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    shop: { findUniqueOrThrow: mocks.findShop },
    shopMember: { findUnique: mocks.findMember },
    managerApprovalToken: { create: mocks.createApprovalToken },
  },
}));
vi.mock("../lib/shop-access.js", () => ({ assertShopAccess: mocks.assertShopAccess }));
vi.mock("../lib/manager-approval.js", () => ({
  MANAGER_APPROVAL_ACTIONS: { "payment.refund": "payment.refund" },
  approvalPayloadFingerprint: mocks.fingerprint,
  signManagerApproval: mocks.sign,
}));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: "cashier-1" }),
}));
vi.mock("../middleware/rate-limit.middleware.js", () => ({
  approvalRateLimit: (_request: unknown, _response: unknown, next: () => void) => next(),
}));

import { managerApprovalRouter } from "./manager-approval.routes.js";

const app = express();
app.use(express.json());
app.use(managerApprovalRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(error.name === "ForbiddenError" ? 403 : 400).json({ message: error.message });
});

const approval = {
  approverId: "manager-1",
  pin: "123456",
  action: "payment.refund",
  targetId: "order-1",
  payload: { orderId: "order-1", amount: 20_000, method: "Cash" },
  reason: "Customer request",
};

describe("manager approval endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertShopAccess.mockResolvedValue({ role: "CASHIER" });
    mocks.findShop.mockResolvedValue({ ownerId: "owner-1", approvalPinHash: "owner-hash" });
    mocks.findMember.mockResolvedValue({ role: "MANAGER", active: true, approvalPinHash: "manager-hash" });
    mocks.compare.mockResolvedValue(true);
    mocks.fingerprint.mockReturnValue("payload-hash");
    mocks.sign.mockReturnValue("approval-token");
  });

  it("allows the Shop owner to approve", async () => {
    const result = await request(app).post("/shop-1/approvals").send({ ...approval, approverId: "owner-1" }).expect(201);
    expect(result.body.approvalToken).toBe("approval-token");
    expect(mocks.compare).toHaveBeenCalledWith("123456", "owner-hash");
    expect(mocks.createApprovalToken).toHaveBeenCalledWith({ data: expect.objectContaining({ shopId: "shop-1", requesterId: "cashier-1", approverId: "owner-1", payloadHash: "payload-hash" }) });
    expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({ shopId: "shop-1", requesterId: "cashier-1", approverId: "owner-1", approverRole: "OWNER", payloadHash: "payload-hash", jti: expect.any(String) }));
  });

  it("allows an active same-Shop Manager to approve", async () => {
    await request(app).post("/shop-1/approvals").send(approval).expect(201);
    expect(mocks.findMember).toHaveBeenCalledWith(expect.objectContaining({ where: { shopId_userId: { shopId: "shop-1", userId: "manager-1" } } }));
    expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({ approverRole: "MANAGER", targetId: "order-1" }));
  });

  it("does not allow a Cashier to approve", async () => {
    mocks.findMember.mockResolvedValue({ role: "CASHIER", active: true, approvalPinHash: "cashier-hash" });
    await request(app).post("/shop-1/approvals").send(approval).expect(403);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("does not allow a Manager from another Shop", async () => {
    mocks.findMember.mockResolvedValue(null);
    await request(app).post("/shop-1/approvals").send(approval).expect(403);
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it("rejects a wrong PIN", async () => {
    mocks.compare.mockResolvedValue(false);
    await request(app).post("/shop-1/approvals").send(approval).expect(403);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});
