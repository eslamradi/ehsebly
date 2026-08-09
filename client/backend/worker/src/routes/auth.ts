import type { Env } from '../env';
import { jsonResponse, readJsonBody } from '../http';
import { isValidEmail, normalizeEmail } from '../email';
import { createOtpCode, isRateLimited, verifyAndConsumeOtpCode, type VerifyOtpResult } from '../db/otp';
import { getOrCreateUserByEmail, getUserByEmail } from '../db/users';
import { createAuthSession } from '../db/authSessions';
import { activatePendingMembershipsForEmail } from '../db/groups';
import { sendOtpEmail } from '../brevo';
import type { RouteHandler } from '../router';
import { errorResponse } from '../errors';

export const requestOtp: RouteHandler<Env> = async (request, env) => {
  const body = await readJsonBody<{ email?: unknown }>(request);
  if (!body || typeof body.email !== 'string' || !isValidEmail(body.email)) {
    return errorResponse('emailRequired', 400);
  }
  const email = normalizeEmail(body.email);

  if (await isRateLimited(env, email)) {
    return errorResponse('tooManyCodes', 429);
  }

  const code = await createOtpCode(env, email);
  const sendResult = await sendOtpEmail(env, email, code);
  if (!sendResult.ok) {
    return errorResponse('codeSendFailed', 502);
  }
  return jsonResponse({ status: 'sent' });
};

const VERIFY_ERROR_MESSAGES: Record<Exclude<VerifyOtpResult, 'ok'>, string> = {
  not_found: 'Request a new code first.',
  expired: 'That code expired — request a new one.',
  too_many_attempts: 'Too many attempts — request a new code.',
  mismatch: 'Incorrect code.',
};

export const verifyOtp: RouteHandler<Env> = async (request, env) => {
  const body = await readJsonBody<{ email?: unknown; code?: unknown }>(request);
  if (!body || typeof body.email !== 'string' || typeof body.code !== 'string') {
    return errorResponse('emailAndCodeRequired', 400);
  }
  const email = normalizeEmail(body.email);

  const result = await verifyAndConsumeOtpCode(env, email, body.code);
  if (result !== 'ok') {
    return jsonResponse({ status: 'error', message: VERIFY_ERROR_MESSAGES[result] }, 400);
  }

  // A brand-new account (no existing row before this) may have pending
  // group invites sent to this email before it ever signed up.
  const existingUser = await getUserByEmail(env, email);
  const user = existingUser ?? (await getOrCreateUserByEmail(env, email));
  if (!existingUser) {
    await activatePendingMembershipsForEmail(env, email, user.id);
  }

  const token = await createAuthSession(env, user.id);
  return jsonResponse({
    status: 'ok',
    token,
    user: { id: user.id, email: user.email, display_name: user.display_name },
  });
};
