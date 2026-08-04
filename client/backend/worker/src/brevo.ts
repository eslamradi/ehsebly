import type { Env } from './env';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

// No verified sending domain is configured separately from the app's own
// contact address — reuse it rather than add another secret/var for a
// single fixed sender.
const SENDER_EMAIL = 'hi@eslamradi.com';
const SENDER_NAME = 'ehsebly';

/**
 * Sends the OTP over email via Brevo's transactional email REST API
 * directly (fetch, no SDK — same style as extract.ts's call to Anthropic
 * and the sms.ts this replaces). When BREVO_API_KEY isn't configured (no
 * account created yet), logs the code instead of sending it — this is what
 * keeps the whole auth flow buildable and testable via `wrangler dev` +
 * curl before that real external account exists. That console-log fallback
 * is only allowed when `ENVIRONMENT` isn't "production" — a production
 * deploy missing the Brevo secret fails loudly instead of leaking real OTP
 * codes into Cloudflare's live request logs (same discipline as sms.ts).
 */
export async function sendOtpEmail(env: Env, email: string, code: string): Promise<{ ok: boolean }> {
  if (!env.BREVO_API_KEY) {
    if (env.ENVIRONMENT === 'production') {
      console.error('sendOtpEmail: ENVIRONMENT=production but BREVO_API_KEY is not configured — refusing to log the OTP code.');
      return { ok: false };
    }
    console.log(`[dev] OTP for ${email}: ${code}`);
    return { ok: true };
  }

  try {
    const response = await fetch(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: SENDER_EMAIL, name: SENDER_NAME },
        to: [{ email }],
        subject: `Your ehsebly code is ${code}`,
        htmlContent: `<p>Your ehsebly verification code is <strong>${code}</strong>. It expires in 5 minutes.</p>`,
        textContent: `Your ehsebly verification code is ${code}. It expires in 5 minutes.`,
      }),
    });
    if (!response.ok) {
      console.error('sendOtpEmail: Brevo returned', response.status, await response.text());
    }
    return { ok: response.ok };
  } catch (error) {
    console.error('sendOtpEmail: fetch to Brevo failed', error);
    return { ok: false };
  }
}
