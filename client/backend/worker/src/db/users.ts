import type { Env } from '../env';
import { generateId } from '../crypto';

export type UserRow = { id: string; email: string; display_name: string | null; created_at: string };

export async function getUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  return row ?? null;
}

export async function createUser(env: Env, email: string): Promise<UserRow> {
  const id = generateId();
  await env.DB.prepare('INSERT INTO users (id, email) VALUES (?, ?)').bind(id, email).run();
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  return row!;
}

export async function getOrCreateUserByEmail(env: Env, email: string): Promise<UserRow> {
  const existing = await getUserByEmail(env, email);
  return existing ?? createUser(env, email);
}

export async function getUserById(env: Env, userId: string): Promise<UserRow | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>();
  return row ?? null;
}

/**
 * Also backfills every one of this user's own (non-removed) group_members
 * rows, not just the users table — createGroup's creator-row insert only
 * snapshots display_name at group-creation time (2026-07-30 gap: nothing
 * ever set it before this, so every existing creator showed as their raw
 * email address). Without this backfill, changing your account name would
 * only affect groups created *after* the change, leaving already-created
 * groups stuck showing the old (email) name.
 */
export async function updateUserDisplayName(env: Env, userId: string, displayName: string): Promise<UserRow> {
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(displayName, userId),
    env.DB.prepare(`UPDATE group_members SET display_name = ? WHERE user_id = ? AND status != 'removed'`).bind(displayName, userId),
  ]);
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>();
  return row!;
}
