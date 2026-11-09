import type { Mail } from "./emailTemplates";

/**
 * Sends through Resend when RESEND_API_KEY and EMAIL_FROM are set (needs a domain you own).
 * Otherwise the email is printed to the terminal so the flow can still be tested.
 * Never throws: a failed email must not break a payment.
 */
export async function sendEmail(to: string, mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.log(`[email:dev] to=${to} subject="${mail.subject}"\n${mail.text}\n`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("[email] provider rejected the message:", res.status);
  } catch (e) {
    console.error("[email] send failed:", e);
  }
}
