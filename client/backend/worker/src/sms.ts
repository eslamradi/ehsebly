import type { Env } from './env';

/**
 * Sends the OTP over SMS via Twilio's REST API directly (fetch, no SDK —
 * same style as extract.ts's call to Anthropic). When the Twilio secrets
 * aren't configured (no account created yet), logs the code instead of
 * sending it — this is what makes the whole auth flow buildable and
 * testable via `wrangler dev` + curl before that real external account
 * exists. That console-log fallback is only allowed when `ENVIRONMENT`
 * isn't "production" (set via wrangler.jsonc's `vars`) — a production
 * deploy missing Twilio secrets fails loudly instead of leaking real OTP
 * codes into Cloudflare's live request logs (code review, Story 2.1,
 * 2026-07-30).
 */
export async function sendOtpSms(env: Env, phoneE164: string, code: string): Promise<{ ok: boolean }> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
    if (env.ENVIRONMENT === 'production') {
      console.error('sendOtpSms: ENVIRONMENT=production but Twilio secrets are not configured — refusing to log the OTP code.');
      return { ok: false };
    }
    console.log(`[dev] OTP for ${phoneE164}: ${code}`);
    return { ok: true };
  }

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phoneE164, From: env.TWILIO_FROM_NUMBER, Body: `Your ehsebly code is ${code}` }),
    });
    if (!response.ok) {
      console.error('sendOtpSms: Twilio returned', response.status, await response.text());
    }
    return { ok: response.ok };
  } catch (error) {
    console.error('sendOtpSms: fetch to Twilio failed', error);
    return { ok: false };
  }
}
