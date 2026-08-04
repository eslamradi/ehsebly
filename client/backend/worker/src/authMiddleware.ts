import type { Env } from './env';
import { jsonResponse } from './http';
import { getUserIdByToken } from './db/authSessions';

export type AuthContext = { userId: string };

/**
 * Every group/account route needs a signed-in user. Returns a Response (401)
 * instead of throwing so route handlers can do
 * `const auth = await requireAuth(...); if (auth instanceof Response) return auth;`
 * and stay flat — matches this Worker's existing no-exceptions-as-control-flow
 * style (extract.ts never throws either).
 */
export async function requireAuth(request: Request, env: Env): Promise<AuthContext | Response> {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) {
    return jsonResponse({ status: 'error', message: 'Sign-in required.' }, 401);
  }
  const userId = await getUserIdByToken(env, token);
  if (!userId) {
    return jsonResponse({ status: 'error', message: 'Sign-in required.' }, 401);
  }
  return { userId };
}

export async function requireGroupMember(env: Env, groupId: string, userId: string): Promise<{ memberId: string } | Response> {
  const row = await env.DB.prepare(`SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'active'`)
    .bind(groupId, userId)
    .first<{ id: string }>();
  if (!row) {
    return jsonResponse({ status: 'error', message: 'Not a member of this group.' }, 403);
  }
  return { memberId: row.id };
}

/**
 * "Admin" has no dedicated role/permission column (2026-07-30 decision) —
 * the group's creator (groups.created_by_user_id) is its one, permanent
 * admin. Call after requireGroupMember, not instead of it — this only
 * checks creator-ness, not membership.
 */
export async function requireGroupAdmin(env: Env, groupId: string, userId: string): Promise<Record<string, never> | Response> {
  const row = await env.DB.prepare('SELECT id FROM groups WHERE id = ? AND created_by_user_id = ?').bind(groupId, userId).first<{ id: string }>();
  if (!row) {
    return jsonResponse({ status: 'error', message: 'Only the group creator can do this.' }, 403);
  }
  return {};
}
