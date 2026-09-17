import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authId: "owner-1",
  assertOwner: vi.fn(),
  shop: vi.fn(),
  outerInvite: vi.fn(),
  outerMember: vi.fn(),
  txUser: vi.fn(),
  txMemberUnique: vi.fn(),
  txMemberFind: vi.fn(),
  txMemberUpdate: vi.fn(),
  txInviteFind: vi.fn(),
  txInviteUpdateMany: vi.fn(),
  txInviteCreate: vi.fn(),
  txInviteUpdate: vi.fn(),
  txInviteFindUnique: vi.fn(),
  revokeSessions: vi.fn(),
  revokeResetTokens: vi.fn(),
  createResetToken: vi.fn(),
  updateUser: vi.fn(),
  upsertPolicy: vi.fn(),
  audit: vi.fn(),
  sendInvite: vi.fn(),
  sendReset: vi.fn(),
}));

const tx = {
  user: { findUnique: mocks.txUser, update: mocks.updateUser },
  shopMember: { findUnique: mocks.txMemberUnique, findFirst: mocks.txMemberFind, update: mocks.txMemberUpdate },
  staffInvite: { findFirst: mocks.txInviteFind, findUniqueOrThrow: mocks.txInviteFindUnique, create: mocks.txInviteCreate, update: mocks.txInviteUpdate, updateMany: mocks.txInviteUpdateMany },
  authSession: { updateMany: mocks.revokeSessions },
  staffPasswordResetToken: { updateMany: mocks.revokeResetTokens, create: mocks.createResetToken },
  shopRolePolicy: { upsert: mocks.upsertPolicy },
};

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    shop: { findUniqueOrThrow: mocks.shop },
    staffInvite: { findFirst: mocks.outerInvite },
    shopMember: { findFirst: mocks.outerMember },
    shopRolePolicy: { findMany: vi.fn() },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("../lib/shop-access.js", () => ({
  DEFAULT_ROLE_PERMISSIONS: { MANAGER: [], CASHIER: [], STOCK_STAFF: [] },
  SHOP_PERMISSIONS: ["staff.manage"],
  STAFF_ROLES: ["MANAGER", "CASHIER", "STOCK_STAFF"],
  assertShopOwner: mocks.assertOwner,
}));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/staff-email.js", () => ({ sendStaffInvite: mocks.sendInvite, sendResetLogin: mocks.sendReset }));
vi.mock("../lib/staff-tokens.js", () => ({
  createStaffToken: () => "raw-secret-token",
  hashStaffToken: (token: string) => `hash:${token}`,
  staffInviteExpiresAt: () => new Date("2026-09-18T00:00:00.000Z"),
  staffResetExpiresAt: () => new Date("2026-09-17T00:30:00.000Z"),
  staffInviteUrl: (token: string) => `https://pos.test/staff/invite?token=${token}`,
  staffResetUrl: (token: string) => `https://pos.test/staff/reset-login?token=${token}`,
}));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuthUser: () => ({ id: mocks.authId, email: `${mocks.authId}@example.test`, sessionId: "session-1" }),
}));

import { staffAccessRouter } from "./staff-access.routes.js";

const app = express();
app.use(express.json());
app.use(staffAccessRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status = error.name === "NotFoundError" ? 404 : error.name === "ForbiddenError" ? 403 : error.name === "ConflictError" ? 409 : error.name === "RateLimitError" ? 429 : 400;
  response.status(status).json({ message: error.message });
});

const shop = { id: "shop-1", name: "Main Shop", owner: { id: "owner-1", email: "owner@example.test" } };
const invitation = { id: "invite-1", shopId: "shop-1", name: "New Staff", email: "staff@example.test", role: "CASHIER" };

describe("owner staff lifecycle routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authId = "owner-1";
    mocks.assertOwner.mockResolvedValue(undefined);
    mocks.shop.mockResolvedValue(shop);
    mocks.txUser.mockResolvedValue(null);
    mocks.txMemberUnique.mockResolvedValue(null);
    mocks.txInviteFind.mockResolvedValue(null);
    mocks.txInviteUpdateMany.mockResolvedValue({ count: 1 });
    mocks.txInviteCreate.mockResolvedValue(invitation);
    mocks.txInviteUpdate.mockResolvedValue(invitation);
    mocks.txInviteFindUnique.mockResolvedValue(invitation);
    mocks.audit.mockResolvedValue(undefined);
    mocks.sendInvite.mockResolvedValue({ state: "disabled" });
    mocks.sendReset.mockResolvedValue({ state: "disabled" });
    mocks.upsertPolicy.mockResolvedValue({ id: "policy-1", role: "CASHIER", permissions: ["staff.manage"] });
  });

  it("lets the Owner create a setup-required invitation without supplying a password", async () => {
    const result = await request(app).post("/shop-1/staff").send({ name: "New Staff", email: "staff@example.test", role: "CASHIER" }).expect(201);
    expect(result.body.invitation).toEqual(expect.objectContaining({ id: "invite-1", status: "SETUP_REQUIRED", emailDelivery: { state: "disabled" } }));
    const data = mocks.txInviteCreate.mock.calls[0]![0].data;
    expect(data).toEqual(expect.objectContaining({ tokenHash: "hash:raw-secret-token", createdById: "owner-1" }));
    expect(data).not.toHaveProperty("password");
    expect(JSON.stringify(data)).not.toContain("https://pos.test");
  });

  it("returns normalized safe statuses and real last-login values", async () => {
    mocks.shop.mockResolvedValue({
      id: "shop-1", name: "Main Shop",
      owner: { id: "owner-1", name: "Owner", email: "owner@example.test", lastLoginAt: new Date("2026-09-16T10:00:00.000Z") },
      staffInvites: [{ id: "invite-1", name: "Pending", email: "pending@example.test", role: "MANAGER", expiresAt: new Date("2026-09-18T00:00:00.000Z"), createdAt: new Date(), updatedAt: new Date(), tokenHash: "must-not-leak" }],
      members: [
        { id: "active-1", role: "CASHIER", active: true, createdAt: new Date(), updatedAt: new Date(), user: { id: "user-1", name: "Active", email: "active@example.test", lastLoginAt: new Date("2026-09-16T09:00:00.000Z") } },
        { id: "inactive-1", role: "STOCK_STAFF", active: false, createdAt: new Date(), updatedAt: new Date(), user: { id: "user-2", name: "Inactive", email: "inactive@example.test", lastLoginAt: null } },
      ],
    });
    const result = await request(app).get("/shop-1/staff").expect(200);
    expect(result.body.staff.map((entry: { status: string }) => entry.status)).toEqual(["ACTIVE", "SETUP_REQUIRED", "ACTIVE", "DEACTIVATED"]);
    expect(result.body.staff[2].lastLoginAt).toBe("2026-09-16T09:00:00.000Z");
    expect(JSON.stringify(result.body)).not.toContain("must-not-leak");
  });

  it("rejects the legacy Owner-supplied password contract", async () => {
    await request(app).post("/shop-1/staff").send({ name: "New Staff", email: "staff@example.test", role: "CASHIER", password: "Password123!" }).expect(400);
    expect(mocks.txInviteCreate).not.toHaveBeenCalled();
  });

  for (const role of ["MANAGER", "CASHIER", "STOCK_STAFF"]) {
    it(`does not let ${role} administer staff`, async () => {
      mocks.authId = role.toLowerCase();
      mocks.assertOwner.mockRejectedValue(Object.assign(new Error("Shop not found."), { name: "NotFoundError" }));
      await request(app).post("/shop-1/staff").send({ name: "New Staff", email: "staff@example.test", role: "CASHIER" }).expect(404);
      expect(mocks.txInviteCreate).not.toHaveBeenCalled();
    });
  }

  it("rejects duplicate active membership", async () => {
    mocks.txUser.mockResolvedValue({ id: "user-1" });
    mocks.txMemberUnique.mockResolvedValue({ active: true });
    await request(app).post("/shop-1/staff").send({ name: "Staff", email: "staff@example.test", role: "MANAGER" }).expect(409);
  });

  it("directs a deactivated member to Reactivate rather than creating a duplicate", async () => {
    mocks.txUser.mockResolvedValue({ id: "user-1" });
    mocks.txMemberUnique.mockResolvedValue({ active: false });
    await request(app).post("/shop-1/staff").send({ name: "Staff", email: "staff@example.test", role: "MANAGER" }).expect(409);
  });

  it("rejects a duplicate valid pending invitation", async () => {
    mocks.txInviteFind.mockResolvedValue({ id: "existing-invite" });
    await request(app).post("/shop-1/staff").send({ name: "Staff", email: "staff@example.test", role: "MANAGER" }).expect(409);
  });

  it("does not roll back a committed invitation when email delivery fails", async () => {
    mocks.sendInvite.mockResolvedValue({ state: "failed" });
    const result = await request(app).post("/shop-1/staff").send({ name: "New Staff", email: "staff@example.test", role: "CASHIER" }).expect(201);
    expect(result.body.invitation.emailDelivery).toEqual({ state: "failed" });
    expect(mocks.txInviteCreate).toHaveBeenCalledOnce();
  });

  it("scopes invitation management to the requested Shop", async () => {
    mocks.outerInvite.mockResolvedValue(null);
    await request(app).post("/shop-2/staff-invites/invite-1/link").expect(404);
    expect(mocks.outerInvite).toHaveBeenCalledWith({ where: { id: "invite-1", shopId: "shop-2" } });
  });

  it("rotates the persisted hash before returning a new copy-link fallback", async () => {
    mocks.outerInvite.mockResolvedValue({ ...invitation, tokenHash: "hash:old-token", revokedAt: null, acceptedAt: null });
    const result = await request(app).post("/shop-1/staff-invites/invite-1/link").expect(200);
    expect(mocks.txInviteUpdateMany).toHaveBeenCalledWith({ where: { id: "invite-1", shopId: "shop-1", acceptedAt: null, revokedAt: null }, data: { tokenHash: "hash:raw-secret-token", expiresAt: expect.any(Date) } });
    expect(mocks.txInviteUpdateMany.mock.calls.at(-1)![0].data.tokenHash).not.toBe("hash:old-token");
    expect(result.body.invitation.inviteUrl).toContain("raw-secret-token");
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });

  it("cancels an invitation by revoking it instead of deleting history", async () => {
    mocks.txInviteFind.mockResolvedValue({ ...invitation, revokedAt: null, acceptedAt: null });
    await request(app).delete("/shop-1/staff-invites/invite-1").expect(204);
    expect(mocks.txInviteUpdateMany).toHaveBeenCalledWith({ where: { id: "invite-1", shopId: "shop-1", acceptedAt: null, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it("revokes active sessions immediately when Staff is deactivated", async () => {
    const current = { id: "member-1", userId: "user-1", role: "CASHIER", active: true, shop: { ownerId: "owner-1" } };
    const updated = { ...current, active: false, createdAt: new Date(), updatedAt: new Date(), user: { id: "user-1", name: "Staff", email: "staff@example.test", lastLoginAt: null } };
    mocks.txMemberFind.mockResolvedValue(current);
    mocks.txMemberUpdate.mockResolvedValue(updated);
    mocks.shop.mockResolvedValue({ id: "shop-1", name: "Main Shop" });
    await request(app).patch("/shop-1/staff/member-1").send({ active: false }).expect(200);
    expect(mocks.revokeSessions).toHaveBeenCalledWith({ where: { userId: "user-1", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it("reactivates without changing the password or clearing a reset requirement", async () => {
    const current = { id: "member-1", userId: "user-1", role: "CASHIER", active: false, shop: { ownerId: "owner-1" } };
    const updated = { ...current, active: true, createdAt: new Date(), updatedAt: new Date(), user: { id: "user-1", name: "Staff", email: "staff@example.test", lastLoginAt: null } };
    mocks.txMemberFind.mockResolvedValue(current);
    mocks.txMemberUpdate.mockResolvedValue(updated);
    mocks.shop.mockResolvedValue({ id: "shop-1", name: "Main Shop" });
    await request(app).patch("/shop-1/staff/member-1").send({ active: true }).expect(200);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.revokeSessions).not.toHaveBeenCalled();
  });

  it("reset login revokes sessions and older reset links before returning one new fallback URL", async () => {
    const member = { id: "member-1", shopId: "shop-1", userId: "user-1", active: true, user: { id: "user-1", name: "Staff", email: "staff@example.test" }, shop: { name: "Main Shop", ownerId: "owner-1" } };
    mocks.outerMember.mockResolvedValue(member);
    mocks.txMemberFind.mockResolvedValue({ id: "member-1" });
    mocks.createResetToken.mockResolvedValue({ id: "reset-1" });
    const result = await request(app).post("/shop-1/staff/member-1/reset-login").expect(201);
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { loginResetRequired: true } });
    expect(mocks.revokeSessions).toHaveBeenCalled();
    expect(mocks.revokeResetTokens).toHaveBeenCalled();
    expect(mocks.createResetToken.mock.calls[0]![0].data.tokenHash).toBe("hash:raw-secret-token");
    expect(result.body.reset.resetUrl).toContain("raw-secret-token");
  });

  it("cannot reset the Owner through Staff management", async () => {
    mocks.outerMember.mockResolvedValue({ id: "bad-owner-member", shopId: "shop-1", userId: "owner-1", active: true, user: { id: "owner-1", name: "Owner", email: "owner@example.test" }, shop: { name: "Main Shop", ownerId: "owner-1" } });
    await request(app).post("/shop-1/staff/bad-owner-member/reset-login").expect(400);
    expect(mocks.createResetToken).not.toHaveBeenCalled();
  });

  it("does not let non-Owners reset a Staff login", async () => {
    mocks.authId = "manager-1";
    mocks.assertOwner.mockRejectedValue(Object.assign(new Error("Shop not found."), { name: "NotFoundError" }));
    await request(app).post("/shop-1/staff/member-1/reset-login").expect(404);
    expect(mocks.outerMember).not.toHaveBeenCalled();
  });

  it("preserves Owner-controlled role-policy updates and their audit event", async () => {
    const result = await request(app).put("/shop-1/role-policies/CASHIER").send({ permissions: ["staff.manage"] }).expect(200);
    expect(result.body.policy).toEqual({ role: "CASHIER", permissions: ["staff.manage"] });
    expect(mocks.audit).toHaveBeenCalledWith(tx, expect.objectContaining({ action: "role.permissionsUpdate", metadata: { role: "CASHIER", permissions: ["staff.manage"] } }));
  });
});
