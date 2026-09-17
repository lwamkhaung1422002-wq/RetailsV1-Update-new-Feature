import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

export type AuthUser = {
  id: string;
  email: string;
  sessionId: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};

export function getAuthUser(request: Request): AuthUser {
  return (request as AuthenticatedRequest).user;
}

export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    response.status(401).json({ message: "Authentication token is required." });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const session = await prisma.authSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { loginResetRequired: false },
      },
      select: { id: true },
    });
    if (!session) throw new Error("Session is not active.");
    (request as AuthenticatedRequest).user = {
      id: payload.userId,
      email: payload.email,
      sessionId: payload.sessionId,
    };
    next();
  } catch {
    response.status(401).json({ message: "Invalid or expired authentication token." });
  }
}
