import { afterEach, describe, expect, it, vi } from "vitest";

import { sendResetLogin, sendStaffInvite } from "./staff-email.js";

const input = { email: "staff@example.test", name: "Staff", shopName: "Shop", url: "https://example.test/secret", expiresAt: new Date("2026-09-18T00:00:00.000Z") };
const original = { provider: process.env.EMAIL_PROVIDER, key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL };
function restore(name: string, value: string | undefined) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }

afterEach(() => {
  restore("EMAIL_PROVIDER", original.provider);
  restore("RESEND_API_KEY", original.key);
  restore("RESEND_FROM_EMAIL", original.from);
  vi.unstubAllGlobals();
});

describe("staff email provider", () => {
  it("works locally with email disabled", async () => {
    process.env.EMAIL_PROVIDER = "disabled";
    expect(await sendStaffInvite(input)).toEqual({ state: "disabled" });
  });

  it("keeps a committed lifecycle action valid when Resend fails", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "POS <pos@example.test>";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider unavailable")));
    expect(await sendResetLogin(input)).toEqual({ state: "failed" });
  });
});
