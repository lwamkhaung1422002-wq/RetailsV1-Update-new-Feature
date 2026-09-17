export type EmailDelivery = {
  state: "disabled" | "sent" | "failed";
};

type StaffEmailInput = {
  email: string;
  name: string;
  shopName: string;
  url: string;
  expiresAt: Date;
};

async function sendWithResend(subject: string, input: StaffEmailInput): Promise<EmailDelivery> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return { state: "failed" };

  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject,
        html: `<p>Hello ${escapeHtml(input.name)},</p><p>${escapeHtml(input.shopName)} sent you a secure Retail POS access link.</p><p><a href="${escapeHtml(input.url)}">Continue setup</a></p><p>This one-time link expires at ${escapeHtml(input.expiresAt.toISOString())}.</p>`,
      }),
    });
    return { state: result.ok ? "sent" : "failed" };
  } catch {
    return { state: "failed" };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

async function send(subject: string, input: StaffEmailInput): Promise<EmailDelivery> {
  if ((process.env.EMAIL_PROVIDER?.trim() || "disabled") !== "resend") return { state: "disabled" };
  return sendWithResend(subject, input);
}

export function sendStaffInvite(input: StaffEmailInput): Promise<EmailDelivery> {
  return send(`${input.shopName} invited you to Retail POS`, input);
}

export function sendResetLogin(input: StaffEmailInput): Promise<EmailDelivery> {
  return send(`${input.shopName} reset your Retail POS login`, input);
}
