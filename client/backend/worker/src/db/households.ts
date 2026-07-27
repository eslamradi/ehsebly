import type { Env } from '../env';
import { generateId } from '../crypto';

export type HouseholdRow = { id: string; name: string; created_by_user_id: string; created_at: string };

export type HouseholdMemberRow = {
  id: string;
  household_id: string;
  user_id: string | null;
  phone_e164: string;
  display_name: string;
  status: 'pending' | 'active' | 'removed';
  invited_by_user_id: string;
  joined_at: string | null;
  created_at: string;
};

export async function createHousehold(env: Env, name: string, createdByUserId: string): Promise<HouseholdRow> {
  const id = generateId();
  // The creator is always the first active member — otherwise they'd create
  // a household they can't immediately log an expense against.
  await env.DB.batch([
    env.DB.prepare('INSERT INTO households (id, name, created_by_user_id) VALUES (?, ?, ?)').bind(id, name, createdByUserId),
    env.DB.prepare(
      `INSERT INTO household_members (id, household_id, user_id, phone_e164, display_name, status, invited_by_user_id, joined_at)
       VALUES (?, ?, ?, (SELECT phone_e164 FROM users WHERE id = ?), (SELECT COALESCE(display_name, phone_e164) FROM users WHERE id = ?), 'active', ?, datetime('now'))`,
    ).bind(generateId(), id, createdByUserId, createdByUserId, createdByUserId, createdByUserId),
  ]);
  const row = await env.DB.prepare('SELECT * FROM households WHERE id = ?').bind(id).first<HouseholdRow>();
  return row!;
}

export async function listHouseholdsForUser(env: Env, userId: string): Promise<Array<HouseholdRow & { member_count: number }>> {
  const { results } = await env.DB.prepare(
    `SELECT h.id, h.name, h.created_by_user_id, h.created_at,
            (SELECT COUNT(*) FROM household_members m2 WHERE m2.household_id = h.id AND m2.status != 'removed') as member_count
     FROM households h
     JOIN household_members m ON m.household_id = h.id
     WHERE m.user_id = ? AND m.status = 'active'
     ORDER BY h.created_at DESC`,
  )
    .bind(userId)
    .all<HouseholdRow & { member_count: number }>();
  return results;
}

export async function getHousehold(env: Env, householdId: string): Promise<HouseholdRow | null> {
  const row = await env.DB.prepare('SELECT * FROM households WHERE id = ?').bind(householdId).first<HouseholdRow>();
  return row ?? null;
}

export async function listHouseholdMembers(env: Env, householdId: string): Promise<HouseholdMemberRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM household_members WHERE household_id = ? AND status != 'removed' ORDER BY created_at ASC`,
  )
    .bind(householdId)
    .all<HouseholdMemberRow>();
  return results;
}

export async function inviteMember(
  env: Env,
  householdId: string,
  phoneE164: string,
  displayName: string,
  invitedByUserId: string,
): Promise<HouseholdMemberRow | 'already_member'> {
  const existingMember = await env.DB.prepare(
    `SELECT id FROM household_members WHERE household_id = ? AND phone_e164 = ? AND status != 'removed'`,
  )
    .bind(householdId, phoneE164)
    .first<{ id: string }>();
  if (existingMember) {
    return 'already_member';
  }

  const id = generateId();
  // A phone that already has an account joins active immediately; one that
  // doesn't yet stays pending until they sign up — see
  // activatePendingMembershipsForPhone below and the migration's comment on
  // household_members for why this is the Stage 2 extensibility point.
  const existingUser = await env.DB.prepare('SELECT id FROM users WHERE phone_e164 = ?').bind(phoneE164).first<{ id: string }>();
  const status = existingUser ? 'active' : 'pending';
  await env.DB.prepare(
    `INSERT INTO household_members (id, household_id, user_id, phone_e164, display_name, status, invited_by_user_id, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      householdId,
      existingUser?.id ?? null,
      phoneE164,
      displayName,
      status,
      invitedByUserId,
      existingUser ? new Date().toISOString() : null,
    )
    .run();
  const row = await env.DB.prepare('SELECT * FROM household_members WHERE id = ?').bind(id).first<HouseholdMemberRow>();
  return row!;
}

/**
 * Called right after a phone number verifies its OTP for the first time —
 * flips any pending household_members rows for that phone to active and
 * links them to the new account, so an invite sent before signup surfaces
 * the moment they join.
 */
export async function activatePendingMembershipsForPhone(env: Env, phoneE164: string, userId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE household_members SET user_id = ?, status = 'active', joined_at = datetime('now')
     WHERE phone_e164 = ? AND status = 'pending'`,
  )
    .bind(userId, phoneE164)
    .run();
}
