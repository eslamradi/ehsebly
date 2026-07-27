import type { Env } from '../env';
import { generateId, randomToken, sha256Hex } from '../crypto';

const SESSION_TTL_DAYS = 90;

export async function createAuthSession(env: Env, userId: string): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', ?))`,
  )
    .bind(generateId(), userId, tokenHash, `+${SESSION_TTL_DAYS} days`)
    .run();
  return token;
}

export async function getUserIdByToken(env: Env, token: string): Promise<string | null> {
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(`SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires_at > datetime('now')`)
    .bind(tokenHash)
    .first<{ user_id: string }>();
  if (!row) {
    return null;
  }
  await env.DB.prepare(`UPDATE auth_sessions SET last_used_at = datetime('now') WHERE token_hash = ?`).bind(tokenHash).run();
  return row.user_id;
}
