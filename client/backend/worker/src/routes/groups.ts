import type { Env } from '../env';
import { jsonResponse, readJsonBody } from '../http';
import { requireAuth, requireGroupAdmin, requireGroupMember } from '../authMiddleware';
import { isValidEmail, normalizeEmail } from '../email';
import {
  acceptGroupInvite,
  createGroup,
  getGroup,
  inviteMember,
  listGroupMembers,
  listGroupsForUser,
  listPendingGroupsForUser,
  type GroupKind,
  type GroupMemberRow,
} from '../db/groups';
import {
  deleteExpense,
  getExpenseGroupId,
  insertExpense,
  listGroupExpenses,
  updateExpense,
  type SubmitExpenseInput,
} from '../db/expenses';
import { listGroupSettlements } from '../db/settlements';
import { calculateExpenseTotals, EXPENSE_TOTALS_TOLERANCE_PIASTRES } from '../expenseCalc';
import type { RouteHandler } from '../router';
import { errorResponse } from '../errors';

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
    return errorResponse('groupNameRequired', 400);
  }
  // Missing kind defaults to 'household' (optional field); an explicitly-provided
  // but invalid kind is rejected rather than silently coerced, matching this
  // codebase's established pattern of rejecting malformed input outright
  // (Story 1.6's isValidRateLine fix) instead of guessing.
  if (body?.kind !== undefined && (typeof body.kind !== 'string' || !VALID_GROUP_KINDS.includes(body.kind as GroupKind))) {
    return errorResponse('groupKindInvalid', 400);
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
    return errorResponse('inviteNotFound', 404);
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
    return errorResponse('groupNotFound', 404);
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

  const body = await readJsonBody<{ email?: unknown; display_name?: unknown }>(request);
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  const displayName = typeof body?.display_name === 'string' ? body.display_name.trim() : '';
  if (!isValidEmail(email) || displayName.length === 0) {
    return errorResponse('inviteFieldsRequired', 400);
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return errorResponse('nameLengthExceeded', 400);
  }

  const result = await inviteMember(env, params.groupId, email, displayName, auth.userId);
  if (result === 'already_active') {
    return errorResponse('alreadyMember', 409);
  }
  if (result === 'already_pending') {
    return jsonResponse({ status: 'error', message: "That email address has already been invited and hasn't joined yet." }, 409);
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

// Shared by submitExpenseRoute (create) and updateExpenseRoute (admin edit,
// 2026-07-30) — both need identical member-id and arithmetic validation
// against the same SubmitExpenseInput shape. Returns an error message, or
// null if the input is valid.
function validateExpenseAgainstGroup(body: SubmitExpenseInput, members: GroupMemberRow[]): string | null {
  // Every member ID the client references must actually belong to this
  // group — requireGroupMember only checks the *caller* is a member;
  // without this, a member of one group could attribute costs/payment to a
  // member ID from a different group entirely (Story 2.4 code review,
  // 2026-07-30).
  const memberIds = new Set(members.map((member) => member.id));
  if (!memberIds.has(body.paid_by_member_id)) {
    return 'paid_by_member_id does not belong to this group.';
  }
  for (const weightsByMemberId of Object.values(body.item_assignments)) {
    for (const memberId of Object.keys(weightsByMemberId)) {
      if (!memberIds.has(memberId)) {
        return 'item_assignments references a member outside this group.';
      }
    }
  }

  // The subtotal must equal the sum of the submitted items' prices — an
  // exact integer sum, no rounding involved (Story 2.4 code review,
  // 2026-07-30).
  const itemsSumPiastres = body.items.reduce((sum, item) => sum + item.price_piastres, 0);
  if (itemsSumPiastres !== body.subtotal_piastres) {
    return 'subtotal_piastres does not match the sum of item prices.';
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
    return 'Submitted totals do not match the submitted subtotal and rates.';
  }
  return null;
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
    return errorResponse('expensePayloadMalformed', 400);
  }

  const members = await listGroupMembers(env, params.groupId);
  const validationError = validateExpenseAgainstGroup(body, members);
  if (validationError) {
    return jsonResponse({ status: 'error', message: validationError }, 400);
  }

  const expenseId = await insertExpense(env, params.groupId, auth.userId, body);
  return jsonResponse({ status: 'ok', expense_id: expenseId });
};

// Admin-only (2026-07-30) — "admin" means the group's creator, the only
// role this app has (requireGroupAdmin). Reuses submitExpenseRoute's exact
// validation so an edit can't sneak past checks a fresh submission can't.
export const updateExpenseRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireGroupMember(env, params.groupId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }
  const adminCheck = await requireGroupAdmin(env, params.groupId, auth.userId);
  if (adminCheck instanceof Response) {
    return adminCheck;
  }

  const existingGroupId = await getExpenseGroupId(env, params.expenseId);
  if (existingGroupId !== params.groupId) {
    return errorResponse('expenseNotFound', 404);
  }

  const body = await readJsonBody<SubmitExpenseInput>(request);
  if (!isValidSubmitExpenseInput(body)) {
    return errorResponse('expensePayloadMalformed', 400);
  }

  const members = await listGroupMembers(env, params.groupId);
  const validationError = validateExpenseAgainstGroup(body, members);
  if (validationError) {
    return jsonResponse({ status: 'error', message: validationError }, 400);
  }

  await updateExpense(env, params.expenseId, body);
  return jsonResponse({ status: 'ok' });
};

// Admin-only (2026-07-30). Settlements are untouched by design — they
// record actual payments made, independent of any one expense.
export const deleteExpenseRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireGroupMember(env, params.groupId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }
  const adminCheck = await requireGroupAdmin(env, params.groupId, auth.userId);
  if (adminCheck instanceof Response) {
    return adminCheck;
  }

  const existingGroupId = await getExpenseGroupId(env, params.expenseId);
  if (existingGroupId !== params.groupId) {
    return errorResponse('expenseNotFound', 404);
  }

  await deleteExpense(env, params.expenseId);
  return jsonResponse({ status: 'ok' });
};
