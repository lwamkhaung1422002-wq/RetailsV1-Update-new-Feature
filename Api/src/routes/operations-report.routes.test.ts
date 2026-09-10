import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assert: vi.fn(), getShops: vi.fn(), getAccess: vi.fn(), hasPermission: vi.fn(), logs: vi.fn(), users: vi.fn(), members: vi.fn(),
}));
vi.mock("../lib/prisma.js", () => ({ prisma: { auditLog: { findMany: mocks.logs }, user: { findMany: mocks.users }, shopMember: { findMany: mocks.members } } }));
vi.mock("../lib/shop-access.js", () => ({ assertShopPermission: mocks.assert, getAccessibleShops: mocks.getShops, getShopAccess: mocks.getAccess, hasShopPermission: mocks.hasPermission }));
vi.mock("../middleware/auth.middleware.js", () => ({ requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(), getAuthUser: () => ({ id: "owner-1" }) }));

import { operationsReportRouter } from "./operations-report.routes.js";

const app = express();
app.use(operationsReportRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => response.status(400).json({ message: error.message }));

describe("operations report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getShops.mockResolvedValue([{ id: "shop-1", name: "Main", ownerId: "owner-1" }, { id: "shop-2", name: "Hledan", ownerId: "owner-1" }]);
    mocks.getAccess.mockImplementation((_userId: string, shopId: string) => Promise.resolve({ shopId, role: "OWNER", permissions: ["audit.view"], isOwner: true }));
    mocks.hasPermission.mockReturnValue(true);
    mocks.logs.mockResolvedValue([{ id: "log-1", shopId: "shop-2", actorId: "cashier-1", action: "payment.refund", entity: "Payment", entityId: "refund-1", metadata: { actorRole: "CASHIER", authorizationMode: "manager-override", approvedById: "manager-1", approvedByRole: "MANAGER", approvalReason: "Customer request" }, createdAt: new Date("2026-09-10T04:00:00.000Z") }]);
    mocks.users.mockResolvedValue([{ id: "cashier-1", name: "Aung Aung" }, { id: "manager-1", name: "Su Su" }]);
    mocks.members.mockResolvedValue([]);
  });

  it("returns branch, actor, role, approver, and sensitive action from AuditLog", async () => {
    const result = await request(app).get("/shop-1/reports/operations?branchId=shop-2&from=2026-09-10&to=2026-09-10").expect(200);
    expect(result.body.events[0]).toMatchObject({ group: "Sensitive Actions", branch: { id: "shop-2", name: "Hledan" }, actor: { id: "cashier-1", name: "Aung Aung", role: "CASHIER" }, approver: { id: "manager-1", name: "Su Su", role: "MANAGER" }, reason: "Customer request" });
    expect(result.body.summary.managerApprovals).toBe(1);
  });
});
