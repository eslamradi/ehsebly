import type { Env } from '../env';
import { jsonResponse, readJsonBody } from '../http';
import { requireAuth, requireGroupMember } from '../authMiddleware';
import { insertSettlement } from '../db/settlements';
import type { RouteHandler } from '../router';

export const recordSettlementRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireGroupMember(env, params.groupId, auth.userId);
  if (membership instanceof Response) {
    return membership;
  }

  const body = await readJsonBody<{
    from_member_id?: unknown;
    to_member_id?: unknown;
    amount_piastres?: unknown;
    note?: unknown;
  }>(request);
  const fromMemberId = typeof body?.from_member_id === 'string' ? body.from_member_id : '';
  const toMemberId = typeof body?.to_member_id === 'string' ? body.to_member_id : '';
  const amountPiastres = typeof body?.amount_piastres === 'number' ? body.amount_piastres : NaN;
  const note = typeof body?.note === 'string' ? body.note : null;

  if (
    !fromMemberId ||
    !toMemberId ||
    !Number.isFinite(amountPiastres) ||
    !Number.isInteger(amountPiastres) ||
    amountPiastres <= 0
  ) {
    return jsonResponse({ status: 'error', message: 'A valid settlement payload is required.' }, 400);
  }

  // Caller must be a party to the settlement they're recording — otherwise
  // any active group member could fabricate a settlement between two other
  // members and silently alter their balances (code review finding, high
  // severity, Story 2.6, 2026-07-30).
  if (membership.memberId !== fromMemberId && membership.memberId !== toMemberId) {
    return jsonResponse({ status: 'error', message: 'You can only record a settlement you are a party to.' }, 403);
  }

  // Both member ids must actually belong to this group, not just exist
  // somewhere in the database — otherwise a member of one group could
  // reference a member id from a different group and corrupt that group's
  // balances (code review finding, high severity, Story 2.6, 2026-07-30).
  // Deliberately NOT using listGroupMembers (db/groups.ts) here — it filters
  // out status='removed', but a settlement can legitimately involve a
  // member who has since left the group (settling a historical debt with
  // them), so this checks group_members directly with no status filter.
  // NOTE: intentionally NOT re-deriving current balances here to cap
  // `amountPiastres` against the live debt — Architecture AD-2 requires all
  // split/balance calculation to stay client-side and the backend to never
  // receive or return split results. The client (SettleUpScreen) only ever
  // sends the exact currently-displayed debt for a pair (no free-amount
  // input exists in the UI today), so overpayment isn't reachable through
  // the shipped app; a future free-amount settle UI would need a deliberate
  // architecture call (an AD-2 exception, mirroring AD-6) before adding
  // server-side balance validation here, not a silent addition.
  const { results: matchingMembers } = await env.DB.prepare(
    `SELECT id FROM group_members WHERE group_id = ? AND id IN (?, ?)`,
  )
    .bind(params.groupId, fromMemberId, toMemberId)
    .all<{ id: string }>();
  const matchedIds = new Set(matchingMembers.map((row) => row.id));
  if (!matchedIds.has(fromMemberId) || !matchedIds.has(toMemberId)) {
    return jsonResponse({ status: 'error', message: 'Both members must belong to this group.' }, 400);
  }

  const settlementId = await insertSettlement(env, params.groupId, fromMemberId, toMemberId, amountPiastres, note, auth.userId);
  return jsonResponse({ status: 'ok', settlement_id: settlementId });
};
