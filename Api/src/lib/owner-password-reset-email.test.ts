import { afterEach, expect, it, vi } from "vitest";
import { sendOwnerPasswordResetCode } from "./owner-password-reset-email.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.RESEND_API_KEY;
const originalFrom = process.env.RESEND_FROM_EMAIL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
  if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = originalFrom;
});

it("sends only the six-digit owner reset code through the Resend email API", async () => {
  process.env.RESEND_API_KEY = "test-api-key";
  process.env.RESEND_FROM_EMAIL = "test@example.test";
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  globalThis.fetch = fetchMock;

  expect(await sendOwnerPasswordResetCode("owner@example.test", "482731")).toBe(true);
  const [url, options] = fetchMock.mock.calls[0]!;
  expect(url).toBe("https://api.resend.com/emails");
  expect(options.method).toBe("POST");
  const body = JSON.parse(options.body);
  expect(body).toMatchObject({ from: "test@example.test", to: ["owner@example.test"], subject: "Your General POS password reset code" });
  expect(body.text).toContain("482731");
  expect(body.text).toContain("10 minutes");
  expect(body.text).not.toContain("http");
});

it("fails closed when configuration or the provider is unavailable", async () => {
  delete process.env.RESEND_API_KEY;
  process.env.RESEND_FROM_EMAIL = "test@example.test";
  const fetchMock = vi.fn().mockResolvedValue({ ok: false });
  globalThis.fetch = fetchMock;
  expect(await sendOwnerPasswordResetCode("owner@example.test", "482731")).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();

  process.env.RESEND_API_KEY = "test-api-key";
  expect(await sendOwnerPasswordResetCode("owner@example.test", "482731")).toBe(false);
});
