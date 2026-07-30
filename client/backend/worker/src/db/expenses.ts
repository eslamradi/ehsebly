import type { Env } from '../env';
import { generateId } from '../crypto';

export type ExpenseItemInput = { name: string; price_piastres: number; quantity: number; is_shared: boolean };

export type SubmitExpenseInput = {
  description: string;
  paid_by_member_id: string;
  subtotal_piastres: number;
  tax_piastres: number;
  service_piastres: number;
  other_service_piastres: number;
  total_piastres: number;
  printed_total_piastres: number | null;
  // Rate fields exist on the wire only to let submitExpenseRoute recompute
  // and verify tax_piastres/service_piastres/other_service_piastres/
  // total_piastres server-side (Story 2.4 code review, 2026-07-30) — not
  // persisted to the DB, since the already-computed *_piastres columns are
  // what the ledger reads.
  tax_enabled: boolean;
  tax_rate_percent: number;
  service_enabled: boolean;
  service_rate_percent: number;
  other_service_enabled: boolean;
  other_service_rate_percent: number;
  items: ExpenseItemInput[];
  // itemIndex -> group_member_id -> weight
  item_assignments: Record<number, Record<string, number>>;
};

export async function insertExpense(
  env: Env,
  groupId: string,
  createdByUserId: string,
  input: SubmitExpenseInput,
): Promise<string> {
  const expenseId = generateId();
  const statements = [
    env.DB.prepare(
      `INSERT INTO expenses (id, group_id, created_by_user_id, paid_by_member_id, description, subtotal_piastres, tax_piastres, service_piastres, other_service_piastres, total_piastres, printed_total_piastres)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      expenseId,
      groupId,
      createdByUserId,
      input.paid_by_member_id,
      input.description,
      input.subtotal_piastres,
      input.tax_piastres,
      input.service_piastres,
      input.other_service_piastres,
      input.total_piastres,
      input.printed_total_piastres,
    ),
  ];

  input.items.forEach((item, index) => {
    const itemId = generateId();
    statements.push(
      env.DB.prepare(
        `INSERT INTO expense_items (id, expense_id, name, price_piastres, quantity, is_shared, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(itemId, expenseId, item.name, item.price_piastres, item.quantity, item.is_shared ? 1 : 0, index),
    );
    const weights = input.item_assignments[index] ?? {};
    for (const [memberId, weight] of Object.entries(weights)) {
      if (weight <= 0) {
        continue;
      }
      statements.push(
        env.DB.prepare(
          `INSERT INTO expense_item_assignments (id, expense_item_id, group_member_id, weight) VALUES (?, ?, ?, ?)`,
        ).bind(generateId(), itemId, memberId, weight),
      );
    }
  });

  // D1's batch() runs every statement in one implicit transaction — an
  // expense with N items is N*(1 + members) inserts that must all land
  // together or not at all, otherwise a partial write corrupts the ledger.
  await env.DB.batch(statements);
  return expenseId;
}

export type ExpenseWithDetails = {
  id: string;
  paid_by_member_id: string;
  description: string;
  subtotal_piastres: number;
  tax_piastres: number;
  service_piastres: number;
  other_service_piastres: number;
  total_piastres: number;
  printed_total_piastres: number | null;
  created_at: string;
  items: Array<{ id: string; name: string; price_piastres: number; quantity: number; is_shared: boolean }>;
  // expense_item_id -> group_member_id -> weight
  assignments: Record<string, Record<string, number>>;
};

export async function listGroupExpenses(env: Env, groupId: string): Promise<ExpenseWithDetails[]> {
  const { results: expenseRows } = await env.DB.prepare(
    `SELECT id, paid_by_member_id, description, subtotal_piastres, tax_piastres, service_piastres, other_service_piastres, total_piastres, printed_total_piastres, created_at
     FROM expenses WHERE group_id = ? ORDER BY created_at ASC`,
  )
    .bind(groupId)
    .all<Omit<ExpenseWithDetails, 'items' | 'assignments'>>();

  if (expenseRows.length === 0) {
    return [];
  }

  const expenseIds = expenseRows.map((row) => row.id);
  const expensePlaceholders = expenseIds.map(() => '?').join(',');
  const { results: itemRows } = await env.DB.prepare(
    `SELECT id, expense_id, name, price_piastres, quantity, is_shared FROM expense_items WHERE expense_id IN (${expensePlaceholders}) ORDER BY sort_order ASC`,
  )
    .bind(...expenseIds)
    .all<{ id: string; expense_id: string; name: string; price_piastres: number; quantity: number; is_shared: number }>();

  const itemIds = itemRows.map((row) => row.id);
  const assignmentRows =
    itemIds.length === 0
      ? []
      : (
          await env.DB.prepare(
            `SELECT expense_item_id, group_member_id, weight FROM expense_item_assignments WHERE expense_item_id IN (${itemIds
              .map(() => '?')
              .join(',')})`,
          )
            .bind(...itemIds)
            .all<{ expense_item_id: string; group_member_id: string; weight: number }>()
        ).results;

  return expenseRows.map((expense) => {
    const items = itemRows
      .filter((item) => item.expense_id === expense.id)
      .map((item) => ({
        id: item.id,
        name: item.name,
        price_piastres: item.price_piastres,
        quantity: item.quantity,
        is_shared: item.is_shared === 1,
      }));
    const assignments: Record<string, Record<string, number>> = {};
    for (const item of items) {
      assignments[item.id] = {};
    }
    for (const assignment of assignmentRows) {
      if (assignment.expense_item_id in assignments) {
        assignments[assignment.expense_item_id][assignment.group_member_id] = assignment.weight;
      }
    }
    return { ...expense, items, assignments };
  });
}
