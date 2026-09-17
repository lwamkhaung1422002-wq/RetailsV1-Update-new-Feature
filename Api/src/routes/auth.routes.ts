import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";

import { clearRefreshCookie, createRefreshToken, hashRefreshToken, readCookie, refreshCookieName, refreshExpiresAt, setRefreshCookie } from "../lib/auth-session.js";
import { writeAuditLog } from "../lib/audit-log.js";
import { signAccessToken, verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { getAccessibleShops, publicShop, SHOP_PERMISSIONS } from "../lib/shop-access.js";
import { hashStaffToken } from "../lib/staff-tokens.js";
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

const tokenSchema = z.object({ token: z.string().min(32).max(512) });
const acceptInviteSchema = tokenSchema.extend({ password: z.string().min(8).max(200).optional() });
const completeResetSchema = tokenSchema.extend({ password: z.string().min(8).max(200) });

function invalidLink(message = "This link is invalid or has expired."): Error {
  return Object.assign(new Error(message), { name: "BadRequestError" });
}

async function issueSession(user: { id: string; email: string }, response: Parameters<typeof setRefreshCookie>[0], recordLogin = false) {
  const refreshToken = createRefreshToken();
  const lastLoginAt = recordLogin ? new Date() : null;
  const session = await prisma.$transaction(async (transaction) => {
    const created = await transaction.authSession.create({
      data: { userId: user.id, tokenHash: hashRefreshToken(refreshToken), expiresAt: refreshExpiresAt() },
    });
    if (lastLoginAt) await transaction.user.update({ where: { id: user.id }, data: { lastLoginAt } });
    return created;
  });
  setRefreshCookie(response, refreshToken);
  return { accessToken: signAccessToken({ userId: user.id, email: user.email, sessionId: session.id }), lastLoginAt };
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

    const { accessToken } = await issueSession(user, response);

    const accessibleShop = { ...publicShop(shop), role: "OWNER", permissions: [...SHOP_PERMISSIONS], isOwner: true };
    response.status(201).json({ user: { ...user, shops: [accessibleShop] }, shop: accessibleShop, accessToken });
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

    const shops = await getAccessibleShops(user.id);
    if (user.loginResetRequired) {
      response.status(403).json({ message: "Login reset is required. Use the secure reset link sent by the store owner." });
      return;
    }
    if (!shops.length) {
      response.status(403).json({ message: "This account does not have active store access." });
      return;
    }
    const { accessToken, lastLoginAt } = await issueSession(user, response, true);

    response.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        lastLoginAt,
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
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.loginResetRequired) {
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
    setRefreshCookie(response, nextRawToken);
    response.status(200).json({ accessToken: signAccessToken({ userId: session.user.id, email: session.user.email, sessionId: nextSession.id }) });
  } catch (error) {
    clearRefreshCookie(response);
    next(error);
  }
});

authRouter.post("/logout", async (request, response, next) => {
  try {
    if (rejectCrossOrigin(request, response)) return;
    const rawToken = readCookie(request.headers.cookie, refreshCookieName);
    const accessHeader = request.headers.authorization;
    let accessSessionId: string | undefined;
    if (accessHeader?.startsWith("Bearer ")) {
      try { accessSessionId = verifyAccessToken(accessHeader.slice("Bearer ".length)).sessionId; } catch { /* Logout remains idempotent for invalid access tokens. */ }
    }
    if (rawToken || accessSessionId) {
      await prisma.authSession.updateMany({
        where: {
          revokedAt: null,
          OR: [
            ...(rawToken ? [{ tokenHash: hashRefreshToken(rawToken) }] : []),
            ...(accessSessionId ? [{ id: accessSessionId }] : []),
          ],
        },
        data: { revokedAt: new Date() },
      });
    }
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
      },
    });

    if (!user) {
      response.status(404).json({ message: "User not found." });
      return;
    }

    const shops = await getAccessibleShops(user.id);
    response.status(200).json({ user: { ...user, shops } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/staff-invites/validate", authRateLimit, async (request, response, next) => {
  try {
    const { token } = tokenSchema.parse(request.body);
    const invite = await prisma.staffInvite.findUnique({
      where: { tokenHash: hashStaffToken(token) },
      include: { shop: { select: { name: true } } },
    });
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) throw invalidLink();
    const existingUser = await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } });
    response.json({
      invitation: {
        shopName: invite.shop.name,
        name: invite.name,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        newPasswordRequired: !existingUser,
      },
    });
  } catch (error) { next(error); }
});

authRouter.post("/staff-invites/accept", authRateLimit, async (request, response, next) => {
  try {
    const input = acceptInviteSchema.parse(request.body);
    const tokenHash = hashStaffToken(input.token);
    const invite = await prisma.staffInvite.findUnique({ where: { tokenHash }, include: { shop: { select: { ownerId: true } } } });
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) throw invalidLink();

    const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
    if (!existingUser && !input.password) throw invalidLink("Create a password to accept this invitation.");
    if (existingUser) {
      if (!input.password || !await bcrypt.compare(input.password, existingUser.password)) throw invalidLink("Enter your existing account password to accept this invitation.");
      if (existingUser.id === invite.shop.ownerId) throw invalidLink();
    }
    const passwordHash = existingUser ? null : await bcrypt.hash(input.password!, 12);

    const accepted = await prisma.$transaction(async (transaction) => {
      const consumed = await transaction.staffInvite.updateMany({
        where: { id: invite.id, tokenHash, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1) throw invalidLink();
      const user = existingUser ?? await transaction.user.create({ data: { name: invite.name, email: invite.email, password: passwordHash! } });
      const current = await transaction.shopMember.findUnique({ where: { shopId_userId: { shopId: invite.shopId, userId: user.id } } });
      if (current) throw Object.assign(new Error(current.active ? "This account already has store access." : "This account is deactivated. Ask the owner to reactivate it."), { name: "ConflictError" });
      const member = await transaction.shopMember.create({ data: { shopId: invite.shopId, userId: user.id, role: invite.role } });
      await writeAuditLog(transaction, { shopId: invite.shopId, actorId: user.id, action: "staff.inviteAccepted", entity: "ShopMember", entityId: member.id, metadata: { inviteId: invite.id, role: invite.role } });
      return { memberId: member.id };
    });
    response.status(200).json({ status: "ACTIVE", ...accepted });
  } catch (error) { next(error); }
});

authRouter.post("/staff-login-reset/validate", authRateLimit, async (request, response, next) => {
  try {
    const { token } = tokenSchema.parse(request.body);
    const reset = await prisma.staffPasswordResetToken.findUnique({
      where: { tokenHash: hashStaffToken(token) },
      include: { shop: { select: { name: true } }, user: { select: { name: true, email: true } } },
    });
    if (!reset || reset.revokedAt || reset.usedAt || reset.expiresAt <= new Date()) throw invalidLink();
    response.json({ reset: { shopName: reset.shop.name, name: reset.user.name, email: reset.user.email, expiresAt: reset.expiresAt } });
  } catch (error) { next(error); }
});

authRouter.post("/staff-login-reset/complete", authRateLimit, async (request, response, next) => {
  try {
    const input = completeResetSchema.parse(request.body);
    const tokenHash = hashStaffToken(input.token);
    const reset = await prisma.staffPasswordResetToken.findUnique({ where: { tokenHash } });
    if (!reset || reset.revokedAt || reset.usedAt || reset.expiresAt <= new Date()) throw invalidLink();
    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.$transaction(async (transaction) => {
      const consumed = await transaction.staffPasswordResetToken.updateMany({
        where: { id: reset.id, tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw invalidLink();
      await transaction.user.update({ where: { id: reset.userId }, data: { password: passwordHash, loginResetRequired: false } });
      await writeAuditLog(transaction, { shopId: reset.shopId, actorId: reset.userId, action: "staff.passwordResetCompleted", entity: "User", entityId: reset.userId });
    });
    response.status(204).end();
  } catch (error) { next(error); }
});
