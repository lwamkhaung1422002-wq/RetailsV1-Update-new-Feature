import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compare: vi.fn(), hash: vi.fn(), sign: vi.fn(), verify: vi.fn(),
  userFind: vi.fn(), userCreate: vi.fn(), userUpdate: vi.fn(),
  inviteFind: vi.fn(), inviteConsume: vi.fn(),
  memberFind: vi.fn(), memberCreate: vi.fn(),
  resetFind: vi.fn(), resetConsume: vi.fn(),
  sessionCreate: vi.fn(), sessionFind: vi.fn(), sessionUpdate: vi.fn(), sessionRevoke: vi.fn(),
  accessibleShops: vi.fn(), audit: vi.fn(),
}));

const tx = {
  user: { create: mocks.userCreate, update: mocks.userUpdate },
  staffInvite: { updateMany: mocks.inviteConsume },
  shopMember: { findUnique: mocks.memberFind, create: mocks.memberCreate },
  staffPasswordResetToken: { updateMany: mocks.resetConsume },
  authSession: { create: mocks.sessionCreate, updateMany: mocks.sessionUpdate },
};

vi.mock("bcrypt", () => ({ default: { compare: mocks.compare, hash: mocks.hash } }));
vi.mock("../lib/jwt.js", () => ({ signAccessToken: mocks.sign, verifyAccessToken: mocks.verify }));
vi.mock("../lib/prisma.js", () => ({ prisma: {
  user: { findUnique: mocks.userFind },
  staffInvite: { findUnique: mocks.inviteFind },
  staffPasswordResetToken: { findUnique: mocks.resetFind },
  authSession: { findUnique: mocks.sessionFind, updateMany: mocks.sessionRevoke },
  $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
} }));
vi.mock("../lib/shop-access.js", () => ({ getAccessibleShops: mocks.accessibleShops, publicShop: (shop: unknown) => shop, SHOP_PERMISSIONS: [] }));
vi.mock("../lib/store-capabilities.js", () => ({ applyTemplateDefaults: vi.fn() }));
vi.mock("../lib/audit-log.js", () => ({ writeAuditLog: mocks.audit }));
vi.mock("../lib/staff-tokens.js", () => ({ hashStaffToken: (token: string) => `hash:${token}` }));
vi.mock("../middleware/rate-limit.middleware.js", () => ({ authRateLimit: (_request: unknown, _response: unknown, next: () => void) => next() }));
vi.mock("../middleware/auth.middleware.js", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
}));

import { authRouter } from "./auth.routes.js";

const app = express();
app.use(express.json());
app.use(authRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status = error.name === "ConflictError" ? 409 : error.name === "ForbiddenError" ? 403 : 400;
  response.status(status).json({ message: error.message });
});

const inviteToken = "invite-token-123456789012345678901234";
const resetToken = "reset-token-1234567890123456789012345";
const validInvite = {
  id: "invite-1", shopId: "shop-1", name: "New Staff", email: "staff@example.test", role: "CASHIER",
  tokenHash: `hash:${inviteToken}`, expiresAt: new Date(Date.now() + 60_000), revokedAt: null, acceptedAt: null,
  shop: { ownerId: "owner-1", name: "Main Shop" },
};
const validReset = { id: "reset-1", shopId: "shop-1", userId: "user-1", tokenHash: `hash:${resetToken}`, expiresAt: new Date(Date.now() + 60_000), revokedAt: null, usedAt: null };

describe("public Staff invitation lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inviteFind.mockResolvedValue(validInvite);
    mocks.userFind.mockResolvedValue(null);
    mocks.hash.mockResolvedValue("password-hash");
    mocks.compare.mockResolvedValue(true);
    mocks.inviteConsume.mockResolvedValue({ count: 1 });
    mocks.userCreate.mockResolvedValue({ id: "user-1", name: "New Staff", email: "staff@example.test" });
    mocks.memberFind.mockResolvedValue(null);
    mocks.memberCreate.mockResolvedValue({ id: "member-1" });
    mocks.audit.mockResolvedValue(undefined);
  });

  it("validates a live invite with safe setup information", async () => {
    const result = await request(app).post("/staff-invites/validate").send({ token: inviteToken }).expect(200);
    expect(result.body.invitation).toEqual(expect.objectContaining({ shopName: "Main Shop", email: "staff@example.test", role: "CASHIER", newPasswordRequired: true }));
    expect(JSON.stringify(result.body)).not.toContain(`hash:${inviteToken}`);
  });

  for (const [state, invite] of [
    ["expired", { ...validInvite, expiresAt: new Date(Date.now() - 1) }],
    ["revoked", { ...validInvite, revokedAt: new Date() }],
    ["consumed", { ...validInvite, acceptedAt: new Date() }],
  ] as const) {
    it(`rejects a ${state} invite`, async () => {
      mocks.inviteFind.mockResolvedValue(invite);
      await request(app).post("/staff-invites/validate").send({ token: inviteToken }).expect(400);
    });
  }

  it("creates the User and membership only when a new-user invite is accepted", async () => {
    const result = await request(app).post("/staff-invites/accept").send({ token: inviteToken, password: "Password123!" }).expect(200);
    expect(result.body).toEqual({ status: "ACTIVE", memberId: "member-1" });
    expect(mocks.hash).toHaveBeenCalledWith("Password123!", 12);
    expect(mocks.userCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ password: "password-hash" }) });
    expect(mocks.memberCreate).toHaveBeenCalledWith({ data: { shopId: "shop-1", userId: "user-1", role: "CASHIER" } });
  });

  it("keeps an existing User password unchanged while accepting membership", async () => {
    mocks.userFind.mockResolvedValue({ id: "user-1", email: "staff@example.test", password: "existing-hash" });
    await request(app).post("/staff-invites/accept").send({ token: inviteToken, password: "ExistingPassword!" }).expect(200);
    expect(mocks.compare).toHaveBeenCalledWith("ExistingPassword!", "existing-hash");
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects token replay when the atomic consume loses the race", async () => {
    mocks.inviteConsume.mockResolvedValue({ count: 0 });
    await request(app).post("/staff-invites/accept").send({ token: inviteToken, password: "Password123!" }).expect(400);
    expect(mocks.memberCreate).not.toHaveBeenCalled();
  });
});

describe("Staff login reset completion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetFind.mockResolvedValue(validReset);
    mocks.resetConsume.mockResolvedValue({ count: 1 });
    mocks.hash.mockResolvedValue("new-password-hash");
    mocks.audit.mockResolvedValue(undefined);
  });

  it("consumes one reset token and restores normal login eligibility", async () => {
    await request(app).post("/staff-login-reset/complete").send({ token: resetToken, password: "NewPassword123!" }).expect(204);
    expect(mocks.resetConsume).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tokenHash: `hash:${resetToken}`, usedAt: null, revokedAt: null }) }));
    expect(mocks.userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { password: "new-password-hash", loginResetRequired: false } });
  });

  it("rejects expired reset links", async () => {
    mocks.resetFind.mockResolvedValue({ ...validReset, expiresAt: new Date(Date.now() - 1) });
    await request(app).post("/staff-login-reset/complete").send({ token: resetToken, password: "NewPassword123!" }).expect(400);
  });

  it("rejects reset-token replay", async () => {
    mocks.resetConsume.mockResolvedValue({ count: 0 });
    await request(app).post("/staff-login-reset/complete").send({ token: resetToken, password: "NewPassword123!" }).expect(400);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});

describe("session issuance and rotation", () => {
  const user = { id: "user-1", name: "Staff", email: "staff@example.test", password: "stored-hash", loginResetRequired: false, createdAt: new Date(), updatedAt: new Date() };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFind.mockResolvedValue(user);
    mocks.compare.mockResolvedValue(true);
    mocks.accessibleShops.mockResolvedValue([{ id: "shop-1", role: "CASHIER" }]);
    mocks.sessionCreate.mockResolvedValue({ id: "session-1" });
    mocks.sign.mockReturnValue("access-token");
  });

  it("normal login creates a session-bound access token and updates lastLoginAt", async () => {
    const result = await request(app).post("/login").send({ email: user.email, password: "Password123!" }).expect(200);
    expect(result.body.accessToken).toBe("access-token");
    expect(mocks.sign).toHaveBeenCalledWith({ userId: "user-1", email: user.email, sessionId: "session-1" });
    expect(mocks.userUpdate).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { lastLoginAt: expect.any(Date) } });
  });

  it("failed login does not update lastLoginAt or create a session", async () => {
    mocks.compare.mockResolvedValue(false);
    await request(app).post("/login").send({ email: user.email, password: "wrong" }).expect(401);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });

  it("blocks normal login while a login reset is required", async () => {
    mocks.userFind.mockResolvedValue({ ...user, loginResetRequired: true });
    await request(app).post("/login").send({ email: user.email, password: "Password123!" }).expect(403);
    expect(mocks.sessionCreate).not.toHaveBeenCalled();
  });

  it("refresh rotation signs the replacement session identity", async () => {
    mocks.sessionFind.mockResolvedValue({ id: "old-session", userId: "user-1", revokedAt: null, expiresAt: new Date(Date.now() + 60_000), user });
    mocks.sessionCreate.mockResolvedValue({ id: "replacement-session" });
    mocks.sessionUpdate.mockResolvedValue({ count: 1 });
    await request(app).post("/refresh").set("Cookie", "pos_refresh=raw-refresh").expect(200);
    expect(mocks.sign).toHaveBeenCalledWith({ userId: "user-1", email: user.email, sessionId: "replacement-session" });
  });

  it("logout revokes the session named by the access token", async () => {
    mocks.verify.mockReturnValue({ userId: "user-1", email: user.email, sessionId: "session-1" });
    await request(app).post("/logout").set("Authorization", "Bearer access-token").expect(204);
    expect(mocks.sessionRevoke).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ id: "session-1" }] }) }));
  });
});
