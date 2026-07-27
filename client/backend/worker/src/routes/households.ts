import type { Env } from '../env';
import { jsonResponse, readJsonBody } from '../http';
import { requireAuth, requireHouseholdMember } from '../authMiddleware';
import { isValidEgyptianPhoneE164 } from '../phone';
import { createHousehold, getHousehold, inviteMember, listHouseholdMembers, listHouseholdsForUser } from '../db/households';
import { insertExpense, listHouseholdExpenses, type SubmitExpenseInput } from '../db/expenses';
import { listHouseholdSettlements } from '../db/settlements';
import type { RouteHandler } from '../router';

export const createHouseholdRoute: RouteHandler<Env> = async (request, env) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  const body = await readJsonBody<{ name?: unknown }>(request);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length === 0) {
    return jsonResponse({ status: 'error', message: 'A household name is required.' }, 400);
  }

  const household = await createHousehold(env, name, auth.userId);
  return jsonResponse({ status: 'ok', household });
};

export const listHouseholdsRoute: RouteHandler<Env> = async (request, env) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  const households = await listHouseholdsForUser(env, auth.userId);
  return jsonResponse({ status: 'ok', households });
};

export const getHouseholdRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireHouseholdMember(env, params.householdId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }

  const household = await getHousehold(env, params.householdId);
  if (!household) {
    return jsonResponse({ status: 'error', message: 'Household not found.' }, 404);
  }
  const members = await listHouseholdMembers(env, params.householdId);
  return jsonResponse({ status: 'ok', household, members });
};

export const inviteMemberRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireHouseholdMember(env, params.householdId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }

  const body = await readJsonBody<{ phone_e164?: unknown; display_name?: unknown }>(request);
  const phoneE164 = typeof body?.phone_e164 === 'string' ? body.phone_e164 : '';
  const displayName = typeof body?.display_name === 'string' ? body.display_name.trim() : '';
  if (!isValidEgyptianPhoneE164(phoneE164) || displayName.length === 0) {
    return jsonResponse({ status: 'error', message: 'A valid phone number and display name are required.' }, 400);
  }

  const result = await inviteMember(env, params.householdId, phoneE164, displayName, auth.userId);
  if (result === 'already_member') {
    return jsonResponse({ status: 'error', message: 'That phone number is already a member.' }, 409);
  }
  return jsonResponse({ status: 'ok', member: result });
};

export const listExpensesRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireHouseholdMember(env, params.householdId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }

  const [members, expenses, settlements] = await Promise.all([
    listHouseholdMembers(env, params.householdId),
    listHouseholdExpenses(env, params.householdId),
    listHouseholdSettlements(env, params.householdId),
  ]);
  return jsonResponse({ status: 'ok', members, expenses, settlements });
};

function isValidSubmitExpenseInput(body: unknown): body is SubmitExpenseInput {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.description === 'string' &&
    typeof candidate.paid_by_member_id === 'string' &&
    typeof candidate.subtotal_piastres === 'number' &&
    typeof candidate.total_piastres === 'number' &&
    Array.isArray(candidate.items) &&
    typeof candidate.item_assignments === 'object' &&
    candidate.item_assignments !== null
  );
}

export const submitExpenseRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireHouseholdMember(env, params.householdId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }

  const body = await readJsonBody<SubmitExpenseInput>(request);
  if (!isValidSubmitExpenseInput(body)) {
    return jsonResponse({ status: 'error', message: 'Malformed expense payload.' }, 400);
  }

  const expenseId = await insertExpense(env, params.householdId, auth.userId, body);
  return jsonResponse({ status: 'ok', expense_id: expenseId });
};
