import type { Env } from '../env';
import { jsonResponse, readJsonBody } from '../http';
import { requireAuth } from '../authMiddleware';
import { getUserById, updateUserDisplayName } from '../db/users';
import type { RouteHandler } from '../router';
import { errorResponse } from '../errors';

// Matches inviteMemberRoute's MAX_DISPLAY_NAME_LENGTH convention (routes/groups.ts).
const MAX_DISPLAY_NAME_LENGTH = 100;

export const getAccountRoute: RouteHandler<Env> = async (request, env) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const user = await getUserById(env, auth.userId);
  if (!user) {
    return errorResponse('accountNotFound', 404);
  }
  return jsonResponse({ status: 'ok', user: { id: user.id, email: user.email, display_name: user.display_name } });
};

export const updateAccountRoute: RouteHandler<Env> = async (request, env) => {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  const body = await readJsonBody<{ display_name?: unknown }>(request);
  const displayName = typeof body?.display_name === 'string' ? body.display_name.trim() : '';
  if (displayName.length === 0) {
    return errorResponse('nameRequired', 400);
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return errorResponse('nameTooLong', 400);
  }
  const user = await updateUserDisplayName(env, auth.userId, displayName);
  return jsonResponse({ status: 'ok', user: { id: user.id, email: user.email, display_name: user.display_name } });
};
