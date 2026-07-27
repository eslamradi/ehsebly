import type { Env } from '../env';
import { jsonResponse, readJsonBody } from '../http';
import { requireAuth, requireHouseholdMember } from '../authMiddleware';
import { insertSettlement } from '../db/settlements';
import type { RouteHandler } from '../router';

export const recordSettlementRoute: RouteHandler<Env> = async (request, env, params) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const membership = await requireHouseholdMember(env, params.householdId, auth.userId);
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

  if (!fromMemberId || !toMemberId || !Number.isFinite(amountPiastres) || amountPiastres <= 0) {
    return jsonResponse({ status: 'error', message: 'A valid settlement payload is required.' }, 400);
  }

  const settlementId = await insertSettlement(env, params.householdId, fromMemberId, toMemberId, amountPiastres, note, auth.userId);
  return jsonResponse({ status: 'ok', settlement_id: settlementId });
};
