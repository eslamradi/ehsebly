import { WORKER_BASE_URL } from './extractionEndpoint';
import type { Group, GroupKind, GroupMember } from '../domain/group';
import type { GroupExpense, GroupSettlement } from '../domain/groupLedger';
import type {
  AcceptGroupInviteResponse,
  CreateGroupResponse,
  DeleteExpenseResponse,
  ExpenseWire,
  GetAccountResponse,
  GetGroupResponse,
  GroupMemberWire,
  GroupWire,
  InviteMemberResponse,
  ListExpensesResponse,
  ListGroupsResponse,
  RecordSettlementResponse,
  RequestOtpResponse,
  SubmitExpenseBody,
  SubmitExpenseResponse,
  UpdateAccountResponse,
  UpdateExpenseResponse,
  VerifyOtpResponse,
} from './groupTypes';

const CLIENT_TIMEOUT_MS = 15_000;

export type ApiResult<T> = { status: 'ok'; data: T } | { status: 'error'; message: string };

/**
 * Bare fetch + AbortController timeout, never throws — same shape as
 * extractReceipt.ts's call to the extraction endpoint, just generalized
 * across every group-API route instead of one hardcoded path.
 */
async function callJson<TResponseBody extends { status: string }>(
  path: string,
  options: { method: 'GET' | 'POST'; token?: string | null; body?: unknown },
): Promise<TResponseBody | { status: 'error'; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const response = await fetch(`${WORKER_BASE_URL}${path}`, {
      method: options.method,
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    return (await response.json()) as TResponseBody;
  } catch {
    return { status: 'error', message: 'Could not reach the group service.' };
  } finally {
    clearTimeout(timeout);
  }
}

function mapMember(wire: GroupMemberWire): GroupMember {
  return { id: wire.id, email: wire.email, displayName: wire.display_name, status: wire.status, userId: wire.user_id };
}

function mapGroup(wire: GroupWire, memberCount: number): Group {
  return { id: wire.id, name: wire.name, kind: wire.kind, memberCount, createdAt: wire.created_at, createdByUserId: wire.created_by_user_id };
}

export async function requestOtp(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await callJson<RequestOtpResponse>('/auth/otp/request', { method: 'POST', body: { email } });
  return result.status === 'sent' ? { ok: true } : { ok: false, message: result.message };
}

export type VerifiedAccount = { userId: string; email: string; displayName: string | null; token: string };

export async function verifyOtp(email: string, code: string): Promise<{ ok: true; account: VerifiedAccount } | { ok: false; message: string }> {
  const result = await callJson<VerifyOtpResponse>('/auth/otp/verify', { method: 'POST', body: { email, code } });
  if (result.status === 'ok') {
    return {
      ok: true,
      account: { userId: result.user.id, email: result.user.email, displayName: result.user.display_name, token: result.token },
    };
  }
  return { ok: false, message: result.message };
}

export type AccountProfile = { userId: string; email: string; displayName: string | null };

export async function getAccount(token: string): Promise<ApiResult<AccountProfile>> {
  const result = await callJson<GetAccountResponse>('/me', { method: 'GET', token });
  return result.status === 'ok'
    ? { status: 'ok', data: { userId: result.user.id, email: result.user.email, displayName: result.user.display_name } }
    : { status: 'error', message: result.message };
}

export async function updateAccountName(token: string, displayName: string): Promise<ApiResult<AccountProfile>> {
  const result = await callJson<UpdateAccountResponse>('/me', { method: 'POST', token, body: { display_name: displayName } });
  return result.status === 'ok'
    ? { status: 'ok', data: { userId: result.user.id, email: result.user.email, displayName: result.user.display_name } }
    : { status: 'error', message: result.message };
}

export async function createGroup(token: string, name: string, kind: GroupKind): Promise<ApiResult<Group>> {
  const result = await callJson<CreateGroupResponse>('/groups', { method: 'POST', token, body: { name, kind } });
  return result.status === 'ok' ? { status: 'ok', data: mapGroup(result.group, 1) } : { status: 'error', message: result.message };
}

export async function listGroups(token: string): Promise<ApiResult<{ groups: Group[]; pendingGroups: Group[] }>> {
  const result = await callJson<ListGroupsResponse>('/groups', { method: 'GET', token });
  if (result.status === 'ok') {
    return {
      status: 'ok',
      data: {
        groups: result.groups.map((group) => mapGroup(group, group.member_count)),
        pendingGroups: result.pending_groups.map((group) => mapGroup(group, group.member_count)),
      },
    };
  }
  return { status: 'error', message: result.message };
}

// Explicit accept step for an invite sent to an already-registered email
// address (2026-07-30 fix — see inviteMember's Dev Notes in
// db/groups.ts / Story 2.3). A brand-new email's invite still
// auto-activates on first OTP verify; this covers the other branch.
export async function acceptGroupInvite(token: string, groupId: string): Promise<ApiResult<GroupMember>> {
  const result = await callJson<AcceptGroupInviteResponse>(`/groups/${groupId}/accept`, { method: 'POST', token });
  return result.status === 'ok' ? { status: 'ok', data: mapMember(result.member) } : { status: 'error', message: result.message };
}

export async function getGroup(token: string, groupId: string): Promise<ApiResult<{ group: Group; members: GroupMember[] }>> {
  const result = await callJson<GetGroupResponse>(`/groups/${groupId}`, { method: 'GET', token });
  if (result.status === 'ok') {
    const members = result.members.map(mapMember);
    return { status: 'ok', data: { group: mapGroup(result.group, members.length), members } };
  }
  return { status: 'error', message: result.message };
}

export async function inviteMember(token: string, groupId: string, email: string, displayName: string): Promise<ApiResult<GroupMember>> {
  const result = await callJson<InviteMemberResponse>(`/groups/${groupId}/members`, {
    method: 'POST',
    token,
    body: { email, display_name: displayName },
  });
  return result.status === 'ok' ? { status: 'ok', data: mapMember(result.member) } : { status: 'error', message: result.message };
}

function mapExpense(wire: ExpenseWire): GroupExpense {
  const itemAssignments: Record<number, Record<string, number>> = {};
  wire.items.forEach((item, index) => {
    itemAssignments[index] = wire.assignments[item.id] ?? {};
  });
  return {
    id: wire.id,
    paidByMemberId: wire.paid_by_member_id,
    description: wire.description,
    createdAt: wire.created_at,
    printedTotalPiastres: wire.printed_total_piastres,
    items: wire.items.map((item) => ({
      id: item.id,
      name: item.name,
      pricePiastres: item.price_piastres,
      quantity: item.quantity,
      isShared: item.is_shared,
    })),
    itemAssignments,
    subtotalPiastres: wire.subtotal_piastres,
    taxPiastres: wire.tax_piastres,
    servicePiastres: wire.service_piastres,
    otherServicePiastres: wire.other_service_piastres,
    totalPiastres: wire.total_piastres,
    taxEnabled: wire.tax_enabled,
    taxRatePercent: wire.tax_rate_percent,
    serviceEnabled: wire.service_enabled,
    serviceRatePercent: wire.service_rate_percent,
    otherServiceEnabled: wire.other_service_enabled,
    otherServiceRatePercent: wire.other_service_rate_percent,
  };
}

export async function listGroupExpenses(
  token: string,
  groupId: string,
): Promise<ApiResult<{ members: GroupMember[]; expenses: GroupExpense[]; settlements: GroupSettlement[] }>> {
  const result = await callJson<ListExpensesResponse>(`/groups/${groupId}/expenses`, { method: 'GET', token });
  if (result.status !== 'ok') {
    return { status: 'error', message: result.message };
  }
  const members = result.members.map(mapMember);
  const expenses = result.expenses.map(mapExpense);
  const settlements: GroupSettlement[] = result.settlements.map((settlement) => ({
    fromMemberId: settlement.from_member_id,
    toMemberId: settlement.to_member_id,
    amountPiastres: settlement.amount_piastres,
  }));
  return { status: 'ok', data: { members, expenses, settlements } };
}

export async function submitGroupExpense(token: string, groupId: string, body: SubmitExpenseBody): Promise<ApiResult<{ expenseId: string }>> {
  const result = await callJson<SubmitExpenseResponse>(`/groups/${groupId}/expenses`, { method: 'POST', token, body });
  return result.status === 'ok' ? { status: 'ok', data: { expenseId: result.expense_id } } : { status: 'error', message: result.message };
}

// Admin-only (group creator — 2026-07-30); server independently enforces
// this via requireGroupAdmin regardless of what the client shows/hides.
export async function updateGroupExpense(
  token: string,
  groupId: string,
  expenseId: string,
  body: SubmitExpenseBody,
): Promise<ApiResult<void>> {
  const result = await callJson<UpdateExpenseResponse>(`/groups/${groupId}/expenses/${expenseId}`, { method: 'POST', token, body });
  return result.status === 'ok' ? { status: 'ok', data: undefined } : { status: 'error', message: result.message };
}

export async function deleteGroupExpense(token: string, groupId: string, expenseId: string): Promise<ApiResult<void>> {
  const result = await callJson<DeleteExpenseResponse>(`/groups/${groupId}/expenses/${expenseId}/delete`, { method: 'POST', token });
  return result.status === 'ok' ? { status: 'ok', data: undefined } : { status: 'error', message: result.message };
}

export async function recordSettlement(
  token: string,
  groupId: string,
  fromMemberId: string,
  toMemberId: string,
  amountPiastres: number,
): Promise<ApiResult<{ settlementId: string }>> {
  const result = await callJson<RecordSettlementResponse>(`/groups/${groupId}/settlements`, {
    method: 'POST',
    token,
    body: { from_member_id: fromMemberId, to_member_id: toMemberId, amount_piastres: amountPiastres },
  });
  return result.status === 'ok' ? { status: 'ok', data: { settlementId: result.settlement_id } } : { status: 'error', message: result.message };
}
