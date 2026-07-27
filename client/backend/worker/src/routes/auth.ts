import type { Env } from '../env';
import { jsonResponse, readJsonBody } from '../http';
import { isValidEgyptianPhoneE164 } from '../phone';
import { createOtpCode, isRateLimited, verifyAndConsumeOtpCode, type VerifyOtpResult } from '../db/otp';
import { getOrCreateUserByPhone, getUserByPhone } from '../db/users';
import { createAuthSession } from '../db/authSessions';
import { activatePendingMembershipsForPhone } from '../db/households';
import { sendOtpSms } from '../sms';
import type { RouteHandler } from '../router';

export const requestOtp: RouteHandler<Env> = async (request, env) => {
  const body = await readJsonBody<{ phone_e164?: unknown }>(request);
  if (!body || typeof body.phone_e164 !== 'string' || !isValidEgyptianPhoneE164(body.phone_e164)) {
    return jsonResponse({ status: 'error', message: 'A valid Egyptian phone number is required.' }, 400);
  }
  const phoneE164 = body.phone_e164;

  if (await isRateLimited(env, phoneE164)) {
    return jsonResponse({ status: 'error', message: 'Too many codes requested — try again later.' }, 429);
  }

  const code = await createOtpCode(env, phoneE164);
  const sendResult = await sendOtpSms(env, phoneE164, code);
  if (!sendResult.ok) {
    return jsonResponse({ status: 'error', message: 'Could not send the verification code.' }, 502);
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
  const body = await readJsonBody<{ phone_e164?: unknown; code?: unknown }>(request);
  if (!body || typeof body.phone_e164 !== 'string' || typeof body.code !== 'string') {
    return jsonResponse({ status: 'error', message: 'Phone number and code are required.' }, 400);
  }
  const phoneE164 = body.phone_e164;

  const result = await verifyAndConsumeOtpCode(env, phoneE164, body.code);
  if (result !== 'ok') {
    return jsonResponse({ status: 'error', message: VERIFY_ERROR_MESSAGES[result] }, 400);
  }

  // A brand-new account (no existing row before this) may have pending
  // household invites sent to this phone before it ever signed up.
  const existingUser = await getUserByPhone(env, phoneE164);
  const user = existingUser ?? (await getOrCreateUserByPhone(env, phoneE164));
  if (!existingUser) {
    await activatePendingMembershipsForPhone(env, phoneE164, user.id);
  }

  const token = await createAuthSession(env, user.id);
  return jsonResponse({
    status: 'ok',
    token,
    user: { id: user.id, phone_e164: user.phone_e164, display_name: user.display_name },
  });
};
