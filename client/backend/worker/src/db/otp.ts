import type { Env } from '../env';
import { randomOtpCode, sha256Hex } from '../crypto';

const OTP_TTL_MINUTES = 5;
const MAX_VERIFY_ATTEMPTS = 5;

// Controls real per-SMS cost — the user explicitly chose phone/SMS auth
// over a cheaper alternative, so these caps are the actual cost guardrail.
const RATE_LIMIT_SHORT_WINDOW_MINUTES = 10;
const RATE_LIMIT_SHORT_MAX = 3;
const RATE_LIMIT_LONG_WINDOW_MINUTES = 24 * 60;
const RATE_LIMIT_LONG_MAX = 8;

async function countRecentOtpSends(env: Env, phoneE164: string, windowMinutes: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM otp_codes WHERE phone_e164 = ? AND created_at >= datetime('now', ?)`,
  )
    .bind(phoneE164, `-${windowMinutes} minutes`)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function isRateLimited(env: Env, phoneE164: string): Promise<boolean> {
  const [shortCount, longCount] = await Promise.all([
    countRecentOtpSends(env, phoneE164, RATE_LIMIT_SHORT_WINDOW_MINUTES),
    countRecentOtpSends(env, phoneE164, RATE_LIMIT_LONG_WINDOW_MINUTES),
  ]);
  return shortCount >= RATE_LIMIT_SHORT_MAX || longCount >= RATE_LIMIT_LONG_MAX;
}

export async function createOtpCode(env: Env, phoneE164: string): Promise<string> {
  const code = randomOtpCode();
  const codeHash = await sha256Hex(code);
  await env.DB.prepare(`INSERT INTO otp_codes (phone_e164, code_hash, expires_at) VALUES (?, ?, datetime('now', ?))`)
    .bind(phoneE164, codeHash, `+${OTP_TTL_MINUTES} minutes`)
    .run();
  return code;
}

export type VerifyOtpResult = 'ok' | 'not_found' | 'expired' | 'too_many_attempts' | 'mismatch';

/**
 * Looks up the most recent unconsumed code for this phone and validates it.
 * Every attempt (including a mismatch) increments the row's attempt counter
 * before returning, so a script can't brute-force a 6-digit code with
 * unlimited tries against one sent code.
 */
export async function verifyAndConsumeOtpCode(env: Env, phoneE164: string, code: string): Promise<VerifyOtpResult> {
  const row = await env.DB.prepare(
    `SELECT id, code_hash, attempts, (expires_at > datetime('now')) as is_valid
     FROM otp_codes WHERE phone_e164 = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(phoneE164)
    .first<{ id: number; code_hash: string; attempts: number; is_valid: number }>();

  if (!row) {
    return 'not_found';
  }
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    return 'too_many_attempts';
  }
  if (!row.is_valid) {
    return 'expired';
  }

  const codeHash = await sha256Hex(code);
  await env.DB.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run();
  if (codeHash !== row.code_hash) {
    return 'mismatch';
  }

  await env.DB.prepare(`UPDATE otp_codes SET consumed_at = datetime('now') WHERE id = ?`).bind(row.id).run();
  return 'ok';
}
