import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextFunction, Request, Response } from "express";

// Local development must never depend on a remote Redis service. A stale or
// unreachable Upstash configuration otherwise blocks login before the API can
// even query the local database.
const hasUpstashConfiguration = process.env.NODE_ENV === "production" && Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);
const maximum = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10);
const limiter = hasUpstashConfiguration
  ? new Ratelimit({
    redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! }),
    limiter: Ratelimit.slidingWindow(maximum, "1 m"),
    prefix: "general-pos:auth",
  })
  : null;
const developmentBuckets = new Map<string, { count: number; resetAt: number }>();
const approvalBuckets = new Map<string, { count: number; resetAt: number }>();

function normalizedEmail(value: unknown): string {
  return typeof value === "object" && value !== null && "email" in value && typeof value.email === "string"
    ? value.email.trim().toLowerCase()
    : "unknown";
}

export function approvalRateLimit(request: Request, response: Response, next: NextFunction): void {
  const approverId = typeof request.body?.approverId === "string" ? request.body.approverId : "unknown";
  const key = `${request.ip}:${approverId}`;
  const now = Date.now();
  const current = approvalBuckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current;
  bucket.count += 1;
  approvalBuckets.set(key, bucket);
  if (bucket.count > 5) {
    response.status(429).json({ message: "Too many approval attempts. Try again later." });
    return;
  }
  next();
}

export async function authRateLimit(request: Request, response: Response, next: NextFunction): Promise<void> {
  if (!limiter) {
    if (process.env.NODE_ENV !== "production") {
      const key = `${request.ip}:${normalizedEmail(request.body)}:${request.path}`;
      const now = Date.now(); const current = developmentBuckets.get(key);
      const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current;
      bucket.count += 1; developmentBuckets.set(key, bucket);
      if (bucket.count > maximum) { response.status(429).json({ message: "Too many authentication attempts. Try again later." }); return; }
      next(); return;
    }
    request.log.error("Authentication rate limiter is not configured.");
    response.status(503).json({ message: "Authentication is temporarily unavailable." });
    return;
  }

  try {
    const result = await limiter.limit(`${request.ip}:${normalizedEmail(request.body)}:${request.path}`);
    response.setHeader("RateLimit-Limit", maximum);
    response.setHeader("RateLimit-Remaining", Math.max(0, result.remaining));
    response.setHeader("RateLimit-Reset", Math.ceil(result.reset / 1_000));
    if (!result.success) {
      response.status(429).json({ message: "Too many authentication attempts. Try again later." });
      return;
    }
    next();
  } catch (error) {
    request.log.error({ error }, "Authentication rate limiter failed.");
    response.status(503).json({ message: "Authentication is temporarily unavailable." });
  }
}
