import type { Env } from '../env';
import { jsonResponse, readJsonBody } from '../http';
import { requireAuth, requireGroupMember } from '../authMiddleware';
import { isValidEgyptianPhoneE164 } from '../phone';
import {
  acceptGroupInvite,
  createGroup,
  getGroup,
  inviteMember,
  listGroupMembers,
  listGroupsForUser,
  listPendingGroupsForUser,
  type GroupKind,
} from '../db/groups';
import { insertExpense, listGroupExpenses, type SubmitExpenseInput } from '../db/expenses';
import { listGroupSettlements } from '../db/settlements';
import { calculateExpenseTotals, EXPENSE_TOTALS_TOLERANCE_PIASTRES } from '../expenseCalc';
import type { RouteHandler } from '../router';

const VALID_GROUP_KINDS: GroupKind[] = ['household', 'trip', 'other'];
// Matches this codebase's general free-text-field posture — bounded, but
// generously so, since no real display name should ever approach this.
const MAX_DISPLAY_NAME_LENGTH = 100;

export const createGroupRoute: RouteHandler<Env> = async (request, env) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  const body = await readJsonBody<{ name?: unknown; kind?: unknown }>(request);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length === 0) {
    return jsonResponse({ status: 'error', message: 'A group name is required.' }, 400);
  }
  // Missing kind defaults to 'household' (optional field); an explicitly-provided
  // but invalid kind is rejected rather than silently coerced, matching this
  // codebase's established pattern of rejecting malformed input outright
  // (Story 1.6's isValidRateLine fix) instead of guessing.
  if (body?.kind !== undefined && (typeof body.kind !== 'string' || !VALID_GROUP_KINDS.includes(body.kind as GroupKind))) {
    return jsonResponse({ status: 'error', message: 'Invalid group kind.' }, 400);
  }
  const kind = typeof body?.kind === 'string' ? (body.kind as GroupKind) : 'household';

  const group = await createGroup(env, name, kind, auth.userId);
  return jsonResponse({ status: 'ok', group });
};

export const listGroupsRoute: RouteHandler<Env> = async (request, env) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  const [groups, pendingGroups] = await Promise.all([listGroupsForUser(env, auth.userId), listPendingGroupsForUser(env, auth.userId)]);
  return jsonResponse({ status: 'ok', groups, pending_groups: pendingGroups });
};

// An existing account's own explicit accept for an invite sent to them
// (2026-07-30 fix — see inviteMember's comment in db/groups.ts). Not gated
// by requireGroupMember: the whole point is the caller isn't an active
// member yet, only requireAuth applies.
export const acceptGroupInviteRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }

  const member = await acceptGroupInvite(env, params.groupId, auth.userId);
  if (!member) {
    return jsonResponse({ status: 'error', message: 'No pending invite found for this group.' }, 404);
  }
  return jsonResponse({ status: 'ok', member });
};

export const getGroupRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireGroupMember(env, params.groupId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }

  const group = await getGroup(env, params.groupId);
  if (!group) {
    return jsonResponse({ status: 'error', message: 'Group not found.' }, 404);
  }
  const members = await listGroupMembers(env, params.groupId);
  return jsonResponse({ status: 'ok', group, members });
};

export const inviteMemberRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireGroupMember(env, params.groupId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }

  const body = await readJsonBody<{ phone_e164?: unknown; display_name?: unknown }>(request);
  const phoneE164 = typeof body?.phone_e164 === 'string' ? body.phone_e164 : '';
  const displayName = typeof body?.display_name === 'string' ? body.display_name.trim() : '';
  if (!isValidEgyptianPhoneE164(phoneE164) || displayName.length === 0) {
    return jsonResponse({ status: 'error', message: 'A valid phone number and display name are required.' }, 400);
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return jsonResponse({ status: 'error', message: `Name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.` }, 400);
  }

  const result = await inviteMember(env, params.groupId, phoneE164, displayName, auth.userId);
  if (result === 'already_active') {
    return jsonResponse({ status: 'error', message: 'That phone number is already a member.' }, 409);
  }
  if (result === 'already_pending') {
    return jsonResponse({ status: 'error', message: "That phone number has already been invited and hasn't joined yet." }, 409);
  }
  return jsonResponse({ status: 'ok', member: result });
};

export const listExpensesRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireGroupMember(env, params.groupId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }

  const [members, expenses, settlements] = await Promise.all([
    listGroupMembers(env, params.groupId),
    listGroupExpenses(env, params.groupId),
    listGroupSettlements(env, params.groupId),
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
    typeof candidate.tax_piastres === 'number' &&
    typeof candidate.service_piastres === 'number' &&
    typeof candidate.other_service_piastres === 'number' &&
    typeof candidate.total_piastres === 'number' &&
    typeof candidate.tax_enabled === 'boolean' &&
    typeof candidate.tax_rate_percent === 'number' &&
    typeof candidate.service_enabled === 'boolean' &&
    typeof candidate.service_rate_percent === 'number' &&
    typeof candidate.other_service_enabled === 'boolean' &&
    typeof candidate.other_service_rate_percent === 'number' &&
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
  const membership = await requireGroupMember(env, params.groupId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }

  const body = await readJsonBody<SubmitExpenseInput>(request);
  if (!isValidSubmitExpenseInput(body)) {
    return jsonResponse({ status: 'error', message: 'Malformed expense payload.' }, 400);
  }

  // Every member ID the client references must actually belong to this
  // group — requireGroupMember above only checks the *caller* is a member;
  // without this, a member of one group could attribute costs/payment to a
  // member ID from a different group entirely (Story 2.4 code review,
  // 2026-07-30).
  const members = await listGroupMembers(env, params.groupId);
  const memberIds = new Set(members.map((member) => member.id));
  if (!memberIds.has(body.paid_by_member_id)) {
    return jsonResponse({ status: 'error', message: 'paid_by_member_id does not belong to this group.' }, 400);
  }
  for (const weightsByMemberId of Object.values(body.item_assignments)) {
    for (const memberId of Object.keys(weightsByMemberId)) {
      if (!memberIds.has(memberId)) {
        return jsonResponse({ status: 'error', message: 'item_assignments references a member outside this group.' }, 400);
      }
    }
  }

  // The subtotal must equal the sum of the submitted items' prices — an
  // exact integer sum, no rounding involved (Story 2.4 code review,
  // 2026-07-30).
  const itemsSumPiastres = body.items.reduce((sum, item) => sum + item.price_piastres, 0);
  if (itemsSumPiastres !== body.subtotal_piastres) {
    return jsonResponse({ status: 'error', message: 'subtotal_piastres does not match the sum of item prices.' }, 400);
  }

  // Recompute service/tax/total server-side from the submitted subtotal and
  // rates (mirrors client/app/domain/splitCalculation.ts's AD-6-governed
  // compounding formula — see expenseCalc.ts) and reject if the
  // client-submitted totals diverge beyond a small rounding tolerance,
  // instead of trusting client arithmetic outright (Story 2.4 code review,
  // 2026-07-30 — relayed from Story 2.6's review).
  const recomputed = calculateExpenseTotals(body.subtotal_piastres, {
    taxEnabled: body.tax_enabled,
    taxRatePercent: body.tax_rate_percent,
    serviceEnabled: body.service_enabled,
    serviceRatePercent: body.service_rate_percent,
    otherServiceEnabled: body.other_service_enabled,
    otherServiceRatePercent: body.other_service_rate_percent,
  });
  const withinTolerance = (a: number, b: number) => Math.abs(a - b) <= EXPENSE_TOTALS_TOLERANCE_PIASTRES;
  if (
    !withinTolerance(recomputed.servicePiastres, body.service_piastres) ||
    !withinTolerance(recomputed.otherServicePiastres, body.other_service_piastres) ||
    !withinTolerance(recomputed.taxPiastres, body.tax_piastres) ||
    !withinTolerance(recomputed.totalPiastres, body.total_piastres)
  ) {
    return jsonResponse({ status: 'error', message: 'Submitted totals do not match the submitted subtotal and rates.' }, 400);
  }

  const expenseId = await insertExpense(env, params.groupId, auth.userId, body);
  return jsonResponse({ status: 'ok', expense_id: expenseId });
};
