import type { Env } from '../env';
import { generateId } from '../crypto';

export type GroupKind = 'household' | 'trip' | 'other';

export type GroupRow = { id: string; name: string; kind: GroupKind; created_by_user_id: string; created_at: string };

export type GroupMemberRow = {
  id: string;
  group_id: string;
  user_id: string | null;
  email: string;
  display_name: string;
  status: 'pending' | 'active' | 'removed';
  invited_by_user_id: string;
  joined_at: string | null;
  created_at: string;
};

export async function createGroup(env: Env, name: string, kind: GroupKind, createdByUserId: string): Promise<GroupRow> {
  const id = generateId();
  // The creator is always the first active member — otherwise they'd create
  // a group they can't immediately log an expense against.
  await env.DB.batch([
    env.DB.prepare('INSERT INTO groups (id, name, kind, created_by_user_id) VALUES (?, ?, ?, ?)').bind(id, name, kind, createdByUserId),
    env.DB.prepare(
      `INSERT INTO group_members (id, group_id, user_id, email, display_name, status, invited_by_user_id, joined_at)
       VALUES (?, ?, ?, (SELECT email FROM users WHERE id = ?), (SELECT COALESCE(display_name, email) FROM users WHERE id = ?), 'active', ?, datetime('now'))`,
    ).bind(generateId(), id, createdByUserId, createdByUserId, createdByUserId, createdByUserId),
  ]);
  const row = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(id).first<GroupRow>();
  return row!;
}

export async function listGroupsForUser(env: Env, userId: string): Promise<Array<GroupRow & { member_count: number }>> {
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.name, g.kind, g.created_by_user_id, g.created_at,
            (SELECT COUNT(*) FROM group_members m2 WHERE m2.group_id = g.id AND m2.status != 'removed') as member_count
     FROM groups g
     JOIN group_members m ON m.group_id = g.id
     WHERE m.user_id = ? AND m.status = 'active'
     ORDER BY g.created_at DESC`,
  )
    .bind(userId)
    .all<GroupRow & { member_count: number }>();
  return results;
}

export async function getGroup(env: Env, groupId: string): Promise<GroupRow | null> {
  const row = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(groupId).first<GroupRow>();
  return row ?? null;
}

export async function listGroupMembers(env: Env, groupId: string): Promise<GroupMemberRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM group_members WHERE group_id = ? AND status != 'removed' ORDER BY created_at ASC`,
  )
    .bind(groupId)
    .all<GroupMemberRow>();
  return results;
}

export async function inviteMember(
  env: Env,
  groupId: string,
  email: string,
  displayName: string,
  invitedByUserId: string,
): Promise<GroupMemberRow | 'already_active' | 'already_pending'> {
  const existingMember = await env.DB.prepare(
    `SELECT status FROM group_members WHERE group_id = ? AND email = ? AND status != 'removed'`,
  )
    .bind(groupId, email)
    .first<{ status: 'pending' | 'active' }>();
  if (existingMember) {
    return existingMember.status === 'active' ? 'already_active' : 'already_pending';
  }

  const id = generateId();
  const existingUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  // Every invite starts pending, regardless of whether the email already has
  // an account (fixed 2026-07-30 — an existing user was previously
  // auto-activated here with no consent step at all). A brand-new email's
  // first-ever OTP verification still auto-activates any pending rows for
  // it via activatePendingMembershipsForEmail below — that remains a
  // reasonable implicit consent, since verifying an email in response to
  // being told about an invite is itself a deliberate act; only an
  // *existing* account being silently opted in with zero action needed
  // fixing. See acceptGroupInvite below and GroupListScreen for the
  // explicit Accept step this now requires.
  try {
    await env.DB.prepare(
      `INSERT INTO group_members (id, group_id, user_id, email, display_name, status, invited_by_user_id, joined_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL)`,
    )
      .bind(id, groupId, existingUser?.id ?? null, email, displayName, invitedByUserId)
      .run();
  } catch (error) {
    // TOCTOU guard: two near-simultaneous invites for the same (group_id,
    // email) can both pass the existingMember check above before either
    // inserts — the migration's UNIQUE(group_id, email) constraint is
    // the real guarantee, this just turns its violation into the same
    // graceful result the non-race path already returns instead of an
    // unhandled 500.
    if (!(error instanceof Error && /UNIQUE constraint failed/i.test(error.message))) {
      throw error;
    }
    const raceLoser = await env.DB.prepare(
      `SELECT status FROM group_members WHERE group_id = ? AND email = ? AND status != 'removed'`,
    )
      .bind(groupId, email)
      .first<{ status: 'pending' | 'active' }>();
    return raceLoser?.status === 'active' ? 'already_active' : 'already_pending';
  }
  const row = await env.DB.prepare('SELECT * FROM group_members WHERE id = ?').bind(id).first<GroupMemberRow>();
  return row!;
}

/**
 * Called right after an email verifies its OTP for the first time —
 * flips any pending group_members rows for that email to active and links
 * them to the new account, so an invite sent before signup surfaces the
 * moment they join.
 */
export async function activatePendingMembershipsForEmail(env: Env, email: string, userId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE group_members SET user_id = ?, status = 'active', joined_at = datetime('now')
     WHERE email = ? AND status = 'pending'`,
  )
    .bind(userId, email)
    .run();
}

/**
 * An existing account's own explicit accept action for a pending invite —
 * the counterpart to activatePendingMembershipsForEmail above, for an email
 * that already had an account at invite time (2026-07-30 fix). Gated by
 * userId matching the pending row, not by group membership — the caller
 * isn't an active member yet, so requireGroupMember can't gate this route.
 */
export async function acceptGroupInvite(env: Env, groupId: string, userId: string): Promise<GroupMemberRow | null> {
  const pending = await env.DB.prepare(
    `SELECT id FROM group_members WHERE group_id = ? AND user_id = ? AND status = 'pending'`,
  )
    .bind(groupId, userId)
    .first<{ id: string }>();
  if (!pending) {
    return null;
  }
  await env.DB.prepare(`UPDATE group_members SET status = 'active', joined_at = datetime('now') WHERE id = ?`).bind(pending.id).run();
  const row = await env.DB.prepare('SELECT * FROM group_members WHERE id = ?').bind(pending.id).first<GroupMemberRow>();
  return row!;
}

export async function listPendingGroupsForUser(env: Env, userId: string): Promise<Array<GroupRow & { member_count: number }>> {
  const { results } = await env.DB.prepare(
    `SELECT g.id, g.name, g.kind, g.created_by_user_id, g.created_at,
            (SELECT COUNT(*) FROM group_members m2 WHERE m2.group_id = g.id AND m2.status != 'removed') as member_count
     FROM groups g
     JOIN group_members m ON m.group_id = g.id
     WHERE m.user_id = ? AND m.status = 'pending'
     ORDER BY g.created_at DESC`,
  )
    .bind(userId)
    .all<GroupRow & { member_count: number }>();
  return results;
}
