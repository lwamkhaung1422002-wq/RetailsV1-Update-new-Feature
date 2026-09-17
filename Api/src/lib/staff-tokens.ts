import { createHash, randomBytes } from "node:crypto";

export const staffInviteLifetimeMs = 24 * 60 * 60 * 1_000;
export const staffResetLifetimeMs = 30 * 60 * 1_000;

export function createStaffToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashStaffToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function staffInviteExpiresAt(now = Date.now()): Date {
  return new Date(now + staffInviteLifetimeMs);
}

export function staffResetExpiresAt(now = Date.now()): Date {
  return new Date(now + staffResetLifetimeMs);
}

function publicUrl(path: string, token: string): string {
  const base = process.env.APP_PUBLIC_URL?.trim() || "http://localhost:5173";
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

export function staffInviteUrl(token: string): string {
  return publicUrl("staff/invite", token);
}

export function staffResetUrl(token: string): string {
  return publicUrl("staff/reset-login", token);
}
