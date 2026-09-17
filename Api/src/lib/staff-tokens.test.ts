import { afterEach, describe, expect, it } from "vitest";

import { createStaffToken, hashStaffToken, staffInviteExpiresAt, staffInviteLifetimeMs, staffInviteUrl, staffResetExpiresAt, staffResetLifetimeMs } from "./staff-tokens.js";

describe("staff lifecycle tokens", () => {
  const originalPublicUrl = process.env.APP_PUBLIC_URL;
  afterEach(() => { if (originalPublicUrl === undefined) delete process.env.APP_PUBLIC_URL; else process.env.APP_PUBLIC_URL = originalPublicUrl; });

  it("creates high-entropy one-time values and stores only deterministic hashes", () => {
    const first = createStaffToken();
    const second = createStaffToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(64);
    expect(hashStaffToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashStaffToken(first)).not.toContain(first);
  });

  it("uses the locked invite and reset expiries", () => {
    const now = Date.now();
    expect(staffInviteExpiresAt(now).getTime() - now).toBe(staffInviteLifetimeMs);
    expect(staffResetExpiresAt(now).getTime() - now).toBe(staffResetLifetimeMs);
  });

  it("returns the raw token only in the fallback URL", () => {
    process.env.APP_PUBLIC_URL = "https://pos.example.test/app/";
    const url = new URL(staffInviteUrl("raw-token"));
    expect(url.origin).toBe("https://pos.example.test");
    expect(url.pathname).toBe("/app/staff/invite");
    expect(url.searchParams.get("token")).toBe("raw-token");
  });
});
