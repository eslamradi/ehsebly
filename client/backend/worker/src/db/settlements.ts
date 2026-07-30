import type { Env } from '../env';
import { generateId } from '../crypto';

export type SettlementRow = {
  id: string;
  group_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_piastres: number;
  note: string | null;
  created_by_user_id: string;
  created_at: string;
};

export async function insertSettlement(
  env: Env,
  groupId: string,
  fromMemberId: string,
  toMemberId: string,
  amountPiastres: number,
  note: string | null,
  createdByUserId: string,
): Promise<string> {
  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO settlements (id, group_id, from_member_id, to_member_id, amount_piastres, note, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, groupId, fromMemberId, toMemberId, amountPiastres, note, createdByUserId)
    .run();
  return id;
}

export async function listGroupSettlements(env: Env, groupId: string): Promise<SettlementRow[]> {
  const { results } = await env.DB.prepare('SELECT * FROM settlements WHERE group_id = ? ORDER BY created_at ASC')
    .bind(groupId)
    .all<SettlementRow>();
  return results;
}
