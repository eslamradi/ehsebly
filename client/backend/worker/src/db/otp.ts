import type { Env } from '../env';
import { randomOtpCode, sha256Hex } from '../crypto';

const OTP_TTL_MINUTES = 5;
const MAX_VERIFY_ATTEMPTS = 5;

// Controls real per-email cost/abuse surface — the same caps that used to
// guard SMS cost now guard against email-sending abuse (rate-limit
// exhaustion, spam-report risk with the provider).
const RATE_LIMIT_SHORT_WINDOW_MINUTES = 10;
const RATE_LIMIT_SHORT_MAX = 3;
const RATE_LIMIT_LONG_WINDOW_MINUTES = 24 * 60;
const RATE_LIMIT_LONG_MAX = 8;

async function countRecentOtpSends(env: Env, email: string, windowMinutes: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM otp_codes WHERE email = ? AND created_at >= datetime('now', ?)`,
  )
    .bind(email, `-${windowMinutes} minutes`)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function isRateLimited(env: Env, email: string): Promise<boolean> {
  const [shortCount, longCount] = await Promise.all([
    countRecentOtpSends(env, email, RATE_LIMIT_SHORT_WINDOW_MINUTES),
    countRecentOtpSends(env, email, RATE_LIMIT_LONG_WINDOW_MINUTES),
  ]);
  return shortCount >= RATE_LIMIT_SHORT_MAX || longCount >= RATE_LIMIT_LONG_MAX;
}

export async function createOtpCode(env: Env, email: string): Promise<string> {
  const code = randomOtpCode();
  const codeHash = await sha256Hex(code);
  await env.DB.prepare(`INSERT INTO otp_codes (email, code_hash, expires_at) VALUES (?, ?, datetime('now', ?))`)
    .bind(email, codeHash, `+${OTP_TTL_MINUTES} minutes`)
    .run();
  return code;
}

export type VerifyOtpResult = 'ok' | 'not_found' | 'expired' | 'too_many_attempts' | 'mismatch';

/**
 * Looks up the most recent unconsumed code for this email and validates it.
 * Every attempt (including a mismatch) increments the row's attempt counter
 * before returning, so a script can't brute-force a 6-digit code with
 * unlimited tries against one sent code.
 */
export async function verifyAndConsumeOtpCode(env: Env, email: string, code: string): Promise<VerifyOtpResult> {
  const row = await env.DB.prepare(
    `SELECT id, code_hash, attempts, (expires_at > datetime('now')) as is_valid
     FROM otp_codes WHERE email = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(email)
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
