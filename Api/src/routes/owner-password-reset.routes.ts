import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";

import { hashRefreshToken } from "../lib/auth-session.js";
import { sendOwnerPasswordResetCode } from "../lib/owner-password-reset-email.js";
import { prisma } from "../lib/prisma.js";
import { authRateLimit } from "../middleware/rate-limit.middleware.js";

export const ownerPasswordResetRouter = Router();

const emailSchema = z.email().trim().toLowerCase();
const requestSchema = z.object({ email: emailSchema });
const verifySchema = requestSchema.extend({ code: z.string().regex(/^\d{6}$/) });
const resetSchema = z.object({ resetToken: z.string().regex(/^[A-Za-z0-9_-]{64}$/), password: z.string().min(8) });
const genericRequestMessage = "If an eligible owner account exists for this email, a verification code has been sent.";
const invalidCodeMessage = "Invalid or expired verification code.";
const codeLifetimeMs = 10 * 60_000;
const resendCooldownMs = 60_000;
const resetLifetimeMs = 10 * 60_000;
const maximumAttempts = 5;

function invalidChallenge(message: string): Error {
  return Object.assign(new Error(message), { name: "BadRequestError" });
}

async function ownerForEmail(email: string): Promise<{ id: string } | null> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user || await prisma.shop.count({ where: { ownerId: user.id } }) === 0) return null;
  return user;
}

ownerPasswordResetRouter.post("/forgot-password/request", authRateLimit, async (request, response, next) => {
  try {
    const { email } = requestSchema.parse(request.body);
    const user = await ownerForEmail(email);
    if (!user) {
      response.status(200).json({ message: genericRequestMessage });
      return;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = await bcrypt.hash(code, 12);
    const now = new Date();
    const challenge = await prisma.$transaction(async (transaction) => {
      const active = await transaction.ownerPasswordResetChallenge.findFirst({
        where: { userId: user.id, usedAt: null, invalidatedAt: null },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (active && now.getTime() - active.createdAt.getTime() < resendCooldownMs) return null;
      await transaction.ownerPasswordResetChallenge.updateMany({
        where: { userId: user.id, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      return transaction.ownerPasswordResetChallenge.create({
        data: { userId: user.id, codeHash, expiresAt: new Date(now.getTime() + codeLifetimeMs) },
      });
    }).catch((error: unknown) => {
      // The unique active-challenge index handles simultaneous requests safely.
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return null;
      throw error;
    });

    if (challenge && !await sendOwnerPasswordResetCode(email, code)) {
      await prisma.ownerPasswordResetChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      });
      request.log?.error("Owner password reset email delivery failed.");
      response.status(503).json({ message: "Password reset email is temporarily unavailable. Please try again later." });
      return;
    }
    response.status(200).json({ message: genericRequestMessage });
  } catch (error) { next(error); }
});

ownerPasswordResetRouter.post("/forgot-password/verify", authRateLimit, async (request, response, next) => {
  try {
    const { email, code } = verifySchema.parse(request.body);
    const user = await ownerForEmail(email);
    if (!user) throw invalidChallenge(invalidCodeMessage);
    const challenge = await prisma.ownerPasswordResetChallenge.findFirst({
      where: { userId: user.id, usedAt: null, invalidatedAt: null, verifiedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const now = new Date();
    if (!challenge || challenge.expiresAt <= now || challenge.attemptCount >= maximumAttempts) throw invalidChallenge(invalidCodeMessage);

    if (!await bcrypt.compare(code, challenge.codeHash)) {
      await prisma.$transaction(async (transaction) => {
        const updated = await transaction.ownerPasswordResetChallenge.updateMany({
          where: { id: challenge.id, attemptCount: { lt: maximumAttempts }, verifiedAt: null, usedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
          data: { attemptCount: { increment: 1 } },
        });
        if (updated.count === 1) {
          await transaction.ownerPasswordResetChallenge.updateMany({
            where: { id: challenge.id, attemptCount: { gte: maximumAttempts }, verifiedAt: null, usedAt: null, invalidatedAt: null },
            data: { invalidatedAt: now },
          });
        }
      });
      throw invalidChallenge(invalidCodeMessage);
    }

    const resetToken = randomBytes(48).toString("base64url");
    const consumed = await prisma.ownerPasswordResetChallenge.updateMany({
      where: { id: challenge.id, attemptCount: challenge.attemptCount, verifiedAt: null, usedAt: null, invalidatedAt: null, expiresAt: { gt: now } },
      data: { verifiedAt: now, resetTokenHash: hashRefreshToken(resetToken), resetExpiresAt: new Date(now.getTime() + resetLifetimeMs) },
    });
    if (consumed.count !== 1) throw invalidChallenge(invalidCodeMessage);
    response.status(200).json({ resetToken });
  } catch (error) { next(error); }
});

ownerPasswordResetRouter.post("/forgot-password/reset", authRateLimit, async (request, response, next) => {
  try {
    const { resetToken, password } = resetSchema.parse(request.body);
    const resetTokenHash = hashRefreshToken(resetToken);
    const challenge = await prisma.ownerPasswordResetChallenge.findUnique({ where: { resetTokenHash } });
    const now = new Date();
    if (!challenge || !challenge.verifiedAt || !challenge.resetExpiresAt || challenge.resetExpiresAt <= now || challenge.usedAt || challenge.invalidatedAt) {
      throw invalidChallenge("Invalid or expired password reset token.");
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (transaction) => {
      if (await transaction.shop.count({ where: { ownerId: challenge.userId } }) === 0) throw invalidChallenge("Invalid or expired password reset token.");
      const consumed = await transaction.ownerPasswordResetChallenge.updateMany({
        where: { id: challenge.id, resetTokenHash, verifiedAt: { not: null }, usedAt: null, invalidatedAt: null, resetExpiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw invalidChallenge("Invalid or expired password reset token.");
      await transaction.user.update({ where: { id: challenge.userId }, data: { password: passwordHash } });
      await transaction.ownerPasswordResetChallenge.updateMany({
        where: { userId: challenge.userId, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      });
      await transaction.authSession.updateMany({
        where: { userId: challenge.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    response.status(204).end();
  } catch (error) { next(error); }
});
