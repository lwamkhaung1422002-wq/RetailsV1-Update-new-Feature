import bcrypt from "bcrypt";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashRefreshToken } from "../lib/auth-session.js";

const mocks = vi.hoisted(() => ({
  userFind: vi.fn(), userUpdate: vi.fn(), shopCount: vi.fn(),
  challengeFindFirst: vi.fn(), challengeFindUnique: vi.fn(), challengeCreate: vi.fn(), challengeUpdateMany: vi.fn(),
  sessionUpdateMany: vi.fn(), transaction: vi.fn(), send: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({ prisma: {
  user: { findUnique: mocks.userFind },
  shop: { count: mocks.shopCount },
  ownerPasswordResetChallenge: { findFirst: mocks.challengeFindFirst, findUnique: mocks.challengeFindUnique, updateMany: mocks.challengeUpdateMany },
  $transaction: mocks.transaction,
} }));
vi.mock("../lib/owner-password-reset-email.js", () => ({ sendOwnerPasswordResetCode: mocks.send }));
vi.mock("../middleware/rate-limit.middleware.js", () => ({ authRateLimit: (_request: unknown, _response: unknown, next: () => void) => next() }));

import { ownerPasswordResetRouter } from "./owner-password-reset.routes.js";

type Challenge = {
  id: string; userId: string; codeHash: string; expiresAt: Date; attemptCount: number;
  verifiedAt: Date | null; resetTokenHash: string | null; resetExpiresAt: Date | null;
  usedAt: Date | null; invalidatedAt: Date | null; createdAt: Date;
};
const app = express();
app.use(express.json());
app.use("/auth", ownerPasswordResetRouter);
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  response.status(error.name === "BadRequestError" ? 400 : 500).json({ message: error.message });
});

let challenges: Challenge[];
let owners: Set<string>;
let users: Map<string, { id: string; email: string; password: string; loginResetRequired: boolean }>;
let sessions: Array<{ userId: string; revokedAt: Date | null }>;

function matches(record: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const value = record[key];
    if (expected === null) return value == null;
    if (typeof expected === "object" && expected !== null && !(expected instanceof Date)) {
      const check = expected as { gt?: Date; not?: null };
      if (check.gt) return value instanceof Date && value > check.gt;
      if ("not" in check) return value != null;
    }
    return value === expected;
  });
}

function requestCode(email = "owner@example.test") {
  return request(app).post("/auth/forgot-password/request").send({ email });
}

function verifyCode(code: string, email = "owner@example.test") {
  return request(app).post("/auth/forgot-password/verify").send({ email, code });
}

beforeEach(() => {
  vi.clearAllMocks();
  challenges = [];
  owners = new Set(["owner-1"]);
  users = new Map([
    ["owner@example.test", { id: "owner-1", email: "owner@example.test", password: "old-hash", loginResetRequired: true }],
    ["staff@example.test", { id: "staff-1", email: "staff@example.test", password: "staff-hash", loginResetRequired: true }],
  ]);
  sessions = [{ userId: "owner-1", revokedAt: null }, { userId: "staff-1", revokedAt: null }];
  mocks.userFind.mockImplementation(async ({ where: { email } }) => users.get(email) ?? null);
  mocks.userUpdate.mockImplementation(async ({ where: { id }, data }) => {
    const user = [...users.values()].find((entry) => entry.id === id)!;
    Object.assign(user, data);
    return user;
  });
  mocks.shopCount.mockImplementation(async ({ where: { ownerId } }) => Number(owners.has(ownerId)));
  mocks.challengeFindFirst.mockImplementation(async ({ where }) => challenges.filter((entry) => matches(entry as unknown as Record<string, unknown>, where)).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null);
  mocks.challengeFindUnique.mockImplementation(async ({ where: { resetTokenHash } }) => challenges.find((entry) => entry.resetTokenHash === resetTokenHash) ?? null);
  mocks.challengeCreate.mockImplementation(async ({ data }) => {
    const challenge: Challenge = { id: `challenge-${challenges.length + 1}`, userId: data.userId, codeHash: data.codeHash, expiresAt: data.expiresAt, attemptCount: 0, verifiedAt: null, resetTokenHash: null, resetExpiresAt: null, usedAt: null, invalidatedAt: null, createdAt: new Date() };
    challenges.push(challenge);
    return challenge;
  });
  mocks.challengeUpdateMany.mockImplementation(async ({ where, data }) => {
    const entries = challenges.filter((entry) => matches(entry as unknown as Record<string, unknown>, where));
    entries.forEach((entry) => Object.entries(data).forEach(([key, value]) => {
      if (key === "attemptCount") entry.attemptCount += (value as { increment: number }).increment;
      else Object.assign(entry, { [key]: value });
    }));
    return { count: entries.length };
  });
  mocks.sessionUpdateMany.mockImplementation(async ({ where: { userId }, data: { revokedAt } }) => {
    const active = sessions.filter((entry) => entry.userId === userId && !entry.revokedAt);
    active.forEach((entry) => { entry.revokedAt = revokedAt; });
    return { count: active.length };
  });
  mocks.transaction.mockImplementation(async (callback) => callback({
    ownerPasswordResetChallenge: { findFirst: mocks.challengeFindFirst, updateMany: mocks.challengeUpdateMany, create: mocks.challengeCreate },
    shop: { count: mocks.shopCount }, user: { update: mocks.userUpdate }, authSession: { updateMany: mocks.sessionUpdateMany },
  }));
  mocks.send.mockResolvedValue(true);
});

describe("owner forgot-password request", () => {
  it("uses the same generic response for owner, staff-only, and unknown addresses, sending only to owners", async () => {
    const owner = await requestCode("OWNER@example.test");
    const staff = await requestCode("staff@example.test");
    const unknown = await requestCode("unknown@example.test");
    expect(owner.status).toBe(200);
    expect(staff.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(owner.body).toEqual(staff.body);
    expect(staff.body).toEqual(unknown.body);
    expect(challenges).toHaveLength(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith("owner@example.test", expect.stringMatching(/^\d{6}$/));
    const code = mocks.send.mock.calls[0]![1];
    expect(challenges[0]!.codeHash).not.toBe(code);
    expect(await bcrypt.compare(code, challenges[0]!.codeHash)).toBe(true);
    expect(challenges[0]!.expiresAt.getTime() - challenges[0]!.createdAt.getTime()).toBeGreaterThan(9 * 60_000);
  });

  it("enforces cooldown, then invalidates the old code on a successful resend", async () => {
    await requestCode();
    const oldCode = mocks.send.mock.calls[0]![1];
    const cooldown = await requestCode();
    expect(cooldown.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    challenges[0]!.createdAt = new Date(Date.now() - 61_000);
    await requestCode();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(challenges[0]!.invalidatedAt).toBeInstanceOf(Date);
    expect(challenges[1]!.invalidatedAt).toBeNull();
    await verifyCode(oldCode).expect(400);
  });

  it("allows an account that owns a shop even when it also has staff access elsewhere", async () => {
    owners.add("staff-1");
    const response = await requestCode("staff@example.test");
    expect(response.status).toBe(200);
    expect(challenges).toHaveLength(1);
    expect(challenges[0]!.userId).toBe("staff-1");
    expect(mocks.send).toHaveBeenCalledWith("staff@example.test", expect.stringMatching(/^\d{6}$/));
  });

  it("invalidates a newly created challenge when Resend fails", async () => {
    mocks.send.mockResolvedValue(false);
    const response = await requestCode();
    expect(response.status).toBe(503);
    expect(response.body.message).not.toMatch(/resend|api key|owner@example/i);
    expect(challenges[0]!.invalidatedAt).toBeInstanceOf(Date);
    await verifyCode("123456").expect(400);
  });
});

describe("owner code verification and password reset", () => {
  it("rejects expired codes and stops after five failed attempts", async () => {
    await requestCode();
    challenges[0]!.expiresAt = new Date(Date.now() - 1);
    await verifyCode("000000").expect(400);
    expect(challenges[0]!.attemptCount).toBe(0);
    challenges[0]!.expiresAt = new Date(Date.now() + 60_000);
    const correctCode = mocks.send.mock.calls[0]![1];
    const wrongCode = correctCode === "000000" ? "000001" : "000000";
    for (let index = 0; index < 5; index += 1) await verifyCode(wrongCode).expect(400);
    expect(challenges[0]!.attemptCount).toBe(5);
    expect(challenges[0]!.invalidatedAt).toBeInstanceOf(Date);
    await verifyCode(correctCode).expect(400);
  });

  it("verifies a correct code and stores only a hash of a separate high-entropy token", async () => {
    await requestCode();
    const code = mocks.send.mock.calls[0]![1];
    const response = await verifyCode(code).expect(200);
    expect(response.body.resetToken).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(response.body.resetToken).not.toBe(code);
    expect(challenges[0]!.resetTokenHash).toBe(hashRefreshToken(response.body.resetToken));
    expect(challenges[0]!.resetTokenHash).not.toBe(response.body.resetToken);
    expect(challenges[0]!.resetExpiresAt!.getTime() - challenges[0]!.verifiedAt!.getTime()).toBeGreaterThan(9 * 60_000);
    await verifyCode(code).expect(400);
  });

  it("rejects invalid and expired tokens", async () => {
    await request(app).post("/auth/forgot-password/reset").send({ resetToken: "a".repeat(64), password: "NewPassword123" }).expect(400);
    await requestCode();
    const verified = await verifyCode(mocks.send.mock.calls[0]![1]).expect(200);
    challenges[0]!.resetExpiresAt = new Date(Date.now() - 1);
    await request(app).post("/auth/forgot-password/reset").send({ resetToken: verified.body.resetToken, password: "NewPassword123" }).expect(400);
    expect(users.get("owner@example.test")!.password).toBe("old-hash");
  });

  it("changes the owner password once, invalidates remaining challenges, revokes sessions, and preserves loginResetRequired", async () => {
    await requestCode();
    const verified = await verifyCode(mocks.send.mock.calls[0]![1]).expect(200);
    const password = "NewPassword123";
    await request(app).post("/auth/forgot-password/reset").send({ resetToken: verified.body.resetToken, password }).expect(204);
    const owner = users.get("owner@example.test")!;
    expect(owner.password).not.toBe(password);
    expect(await bcrypt.compare(password, owner.password)).toBe(true);
    expect(owner.loginResetRequired).toBe(true);
    expect(challenges[0]!.usedAt).toBeInstanceOf(Date);
    expect(mocks.challengeUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "owner-1", usedAt: null, invalidatedAt: null }), data: { invalidatedAt: expect.any(Date) } }));
    expect(sessions[0]!.revokedAt).toBeInstanceOf(Date);
    expect(sessions[1]!.revokedAt).toBeNull();
    await request(app).post("/auth/forgot-password/reset").send({ resetToken: verified.body.resetToken, password: "AgainPassword123" }).expect(400);
    expect(await bcrypt.compare(password, owner.password)).toBe(true);
  });

  it("rejects reset if the user no longer owns a shop", async () => {
    await requestCode();
    const verified = await verifyCode(mocks.send.mock.calls[0]![1]).expect(200);
    owners.delete("owner-1");
    await request(app).post("/auth/forgot-password/reset").send({ resetToken: verified.body.resetToken, password: "NewPassword123" }).expect(400);
    expect(users.get("owner@example.test")!.password).toBe("old-hash");
  });
});
