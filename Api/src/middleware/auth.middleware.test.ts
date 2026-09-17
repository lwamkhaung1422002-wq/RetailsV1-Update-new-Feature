import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), findSession: vi.fn() }));
vi.mock("../lib/jwt.js", () => ({ verifyAccessToken: mocks.verify }));
vi.mock("../lib/prisma.js", () => ({ prisma: { authSession: { findFirst: mocks.findSession } } }));

import { getAuthUser, requireAuth } from "./auth.middleware.js";

const app = express();
app.get("/private", requireAuth, (req, res) => res.json(getAuthUser(req)));

describe("session-bound access authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockReturnValue({ userId: "user-1", email: "staff@example.test", sessionId: "session-1" });
    mocks.findSession.mockResolvedValue({ id: "session-1" });
  });

  it("accepts a token only while its database session is active", async () => {
    const result = await request(app).get("/private").set("Authorization", "Bearer token").expect(200);
    expect(result.body).toEqual({ id: "user-1", email: "staff@example.test", sessionId: "session-1" });
    expect(mocks.findSession).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "session-1", userId: "user-1", revokedAt: null }) }));
  });

  it("rejects an otherwise valid access token after session revocation", async () => {
    mocks.findSession.mockResolvedValue(null);
    await request(app).get("/private").set("Authorization", "Bearer token").expect(401);
  });
});
