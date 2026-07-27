import type { Env } from '../env';
import { generateId } from '../crypto';

export type SettlementRow = {
  id: string;
  household_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_piastres: number;
  note: string | null;
  created_by_user_id: string;
  created_at: string;
};

export async function insertSettlement(
  env: Env,
  householdId: string,
  fromMemberId: string,
  toMemberId: string,
  amountPiastres: number,
  note: string | null,
  createdByUserId: string,
): Promise<string> {
  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO settlements (id, household_id, from_member_id, to_member_id, amount_piastres, note, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, householdId, fromMemberId, toMemberId, amountPiastres, note, createdByUserId)
    .run();
  return id;
}

export async function listHouseholdSettlements(env: Env, householdId: string): Promise<SettlementRow[]> {
  const { results } = await env.DB.prepare('SELECT * FROM settlements WHERE household_id = ? ORDER BY created_at ASC')
    .bind(householdId)
    .all<SettlementRow>();
  return results;
}
