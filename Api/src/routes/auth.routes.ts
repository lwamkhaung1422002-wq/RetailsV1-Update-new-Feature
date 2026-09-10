import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";

import { clearRefreshCookie, createRefreshToken, hashRefreshToken, readCookie, refreshCookieName, refreshExpiresAt, setRefreshCookie } from "../lib/auth-session.js";
import { signAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { applyTemplateDefaults } from "../lib/store-capabilities.js";
import { type AuthenticatedRequest, requireAuth } from "../middleware/auth.middleware.js";
import { authRateLimit } from "../middleware/rate-limit.middleware.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  shopName: z.string().trim().min(1, "Shop name is required."),
  currencyCode: z.enum(["MMK", "USD", "THB"]),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1, "Password is required."),
});

function issueSession(user: { id: string; email: string }, response: Parameters<typeof setRefreshCookie>[0]) {
  const refreshToken = createRefreshToken();
  const accessToken = signAccessToken({ userId: user.id, email: user.email });
  return prisma.authSession.create({
    data: { userId: user.id, tokenHash: hashRefreshToken(refreshToken), expiresAt: refreshExpiresAt() },
  }).then(() => {
    setRefreshCookie(response, refreshToken);
    return accessToken;
  });
}

function rejectCrossOrigin(request: Parameters<typeof authRateLimit>[0], response: Parameters<typeof setRefreshCookie>[0]): boolean {
  const origin = request.headers.origin;
  const expectedOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const local = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? "");
  if (origin && !local && !expectedOrigins.includes(origin)) {
    response.status(403).json({ message: "Request origin is not allowed." });
    return true;
  }
  return false;
}

authRouter.post("/register", authRateLimit, async (request, response, next) => {
  try {
    const input = registerSchema.parse(request.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      response.status(409).json({ message: "Email is already registered." });
      return;
    }

    const hashedPassword = await bcrypt.hash(input.password, 12);

    const { user, shop } = await prisma.$transaction(async (transaction) => {
      const createdUser = await transaction.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: hashedPassword,
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const createdShop = await transaction.shop.create({
        data: {
          name: input.shopName,
          ownerId: createdUser.id,
          ledgerEnabled: true,
          inventoryReadMode: "LEDGER",
          ledgerCutoverAt: new Date(),
          setting: {
            create: { currencyCode: input.currencyCode },
          },
        },
        include: { setting: true },
      });
      await applyTemplateDefaults(transaction, createdShop.id, "GENERAL_STORE", { includeCategories: false });

      return { user: createdUser, shop: createdShop };
    }, {
      // Template defaults create several tenant-scoped records. Keep the
      // transaction atomic while allowing slower CI/Windows database runners
      // enough time under concurrent browser registration tests.
      maxWait: 10_000,
      timeout: 20_000,
    });

    const accessToken = await issueSession(user, response);

    response.status(201).json({ user: { ...user, shops: [shop] }, shop, accessToken });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", authRateLimit, async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      response.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password);

    if (!passwordMatches) {
      response.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const accessToken = await issueSession(user, response);

    const shops = await prisma.shop.findMany({
      where: { ownerId: user.id },
      include: { setting: true },
      orderBy: { createdAt: "desc" },
    });

    response.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        shops,
      },
      accessToken,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/refresh", async (request, response, next) => {
  try {
    if (rejectCrossOrigin(request, response)) return;
    const rawToken = readCookie(request.headers.cookie, refreshCookieName);
    if (!rawToken) {
      response.status(401).json({ message: "Refresh session is required." });
      return;
    }

    const session = await prisma.authSession.findUnique({ where: { tokenHash: hashRefreshToken(rawToken) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      clearRefreshCookie(response);
      response.status(401).json({ message: "Refresh session is invalid or expired." });
      return;
    }

    const nextRawToken = createRefreshToken();
    const nextSession = await prisma.$transaction(async (transaction) => {
      const replacement = await transaction.authSession.create({
        data: { userId: session.userId, tokenHash: hashRefreshToken(nextRawToken), expiresAt: refreshExpiresAt() },
      });
      const revoked = await transaction.authSession.updateMany({
        where: { id: session.id, revokedAt: null, replacedById: null },
        data: { revokedAt: new Date(), replacedById: replacement.id },
      });
      if (revoked.count !== 1) throw new Error("Refresh session has already been used.");
      return replacement;
    });
    void nextSession;
    setRefreshCookie(response, nextRawToken);
    response.status(200).json({ accessToken: signAccessToken({ userId: session.user.id, email: session.user.email }) });
  } catch (error) {
    clearRefreshCookie(response);
    next(error);
  }
});

authRouter.post("/logout", async (request, response, next) => {
  try {
    if (rejectCrossOrigin(request, response)) return;
    const rawToken = readCookie(request.headers.cookie, refreshCookieName);
    if (rawToken) await prisma.authSession.updateMany({ where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
    clearRefreshCookie(response);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, async (request, response, next) => {
  try {
    const authRequest = request as AuthenticatedRequest;

    const user = await prisma.user.findUnique({
      where: { id: authRequest.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        updatedAt: true,
        shops: {
          orderBy: { createdAt: "desc" },
          include: { setting: true },
        },
      },
    });

    if (!user) {
      response.status(404).json({ message: "User not found." });
      return;
    }

    response.status(200).json({ user });
  } catch (error) {
    next(error);
  }
});
