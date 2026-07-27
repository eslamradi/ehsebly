import type { Env } from '../env';
import { generateId } from '../crypto';

export type UserRow = { id: string; phone_e164: string; display_name: string | null; created_at: string };

export async function getUserByPhone(env: Env, phoneE164: string): Promise<UserRow | null> {
  const row = await env.DB.prepare('SELECT * FROM users WHERE phone_e164 = ?').bind(phoneE164).first<UserRow>();
  return row ?? null;
}

export async function createUser(env: Env, phoneE164: string): Promise<UserRow> {
  const id = generateId();
  await env.DB.prepare('INSERT INTO users (id, phone_e164) VALUES (?, ?)').bind(id, phoneE164).run();
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  return row!;
}

export async function getOrCreateUserByPhone(env: Env, phoneE164: string): Promise<UserRow> {
  const existing = await getUserByPhone(env, phoneE164);
  return existing ?? createUser(env, phoneE164);
}
