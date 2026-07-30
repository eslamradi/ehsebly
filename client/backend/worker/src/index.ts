import { extractReceiptViaVisionLLM } from './extract';
import type { ExtractionResponse } from './types';
import type { Env } from './env';
import { jsonResponse as genericJsonResponse } from './http';
import { createRouter } from './router';
import { requestOtp, verifyOtp } from './routes/auth';
import {
  acceptGroupInviteRoute,
  createGroupRoute,
  getGroupRoute,
  inviteMemberRoute,
  listExpensesRoute,
  listGroupsRoute,
  submitExpenseRoute,
} from './routes/groups';
import { recordSettlementRoute } from './routes/settlements';

export type { Env };

function jsonResponse(body: ExtractionResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// No real multi-photo receipt (a long paper receipt shot in pieces, or a
// scrolled delivery-app order screen) needs anywhere near this many images —
// exists to cap payload size and vision-LLM cost against an abusive request,
// same spirit as extract.ts's MAX_ITEM_QUANTITY.
const MAX_IMAGES = 8;

async function handleExtraction(request: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) {
    console.error('Worker fetch: ANTHROPIC_API_KEY is not configured');
    return jsonResponse({ status: 'error', message: 'Extraction service is not configured.' }, 500);
  }

  // The client posts one or more photos as multipart/form-data, all under
  // the repeated field name "images" — not a single raw image body
  // anymore, now that a receipt can span multiple photos/screenshots.
  let imagesBytes: ArrayBuffer[];
  try {
    const formData = await request.formData();
    const allEntries = [...formData.keys()];
    const files = formData.getAll('images').filter((value): value is File => value instanceof File);
    imagesBytes = await Promise.all(files.map((file) => file.arrayBuffer()));
    console.log(
      'Worker fetch: parsed form data',
      'content-type:', request.headers.get('content-type'),
      'field names:', JSON.stringify(allEntries),
      'image files:', files.length,
      'sizes:', JSON.stringify(imagesBytes.map((b) => b.byteLength)),
    );
  } catch (error) {
    console.error('Worker fetch: failed to read request body', error, 'content-type:', request.headers.get('content-type'));
    return jsonResponse({ status: 'error', message: 'Could not read the uploaded photo(s).' }, 400);
  }

  if (imagesBytes.length === 0 || imagesBytes.every((bytes) => bytes.byteLength === 0)) {
    console.error('Worker fetch: no non-empty images found', 'content-type:', request.headers.get('content-type'));
    return jsonResponse({ status: 'error', message: 'No image received.' }, 400);
  }

  if (imagesBytes.length > MAX_IMAGES) {
    return jsonResponse({ status: 'error', message: `Too many photos — up to ${MAX_IMAGES} at once.` }, 400);
  }

  const result = await extractReceiptViaVisionLLM(imagesBytes, env.ANTHROPIC_API_KEY);
  return jsonResponse(result);
}

// Group API routes (accounts, groups, ledger) — entirely additive alongside
// the extraction route above, which every existing client build keeps
// hitting at POST / exactly as before. A "group" covers both household
// splitting and group-trip splitting — same mechanics, distinguished only
// by the group's `kind` field for UI copy.
const router = createRouter<Env>();
router.add('POST', '/auth/otp/request', requestOtp);
router.add('POST', '/auth/otp/verify', verifyOtp);
router.add('POST', '/groups', createGroupRoute);
router.add('GET', '/groups', listGroupsRoute);
router.add('GET', '/groups/:groupId', getGroupRoute);
router.add('POST', '/groups/:groupId/members', inviteMemberRoute);
router.add('POST', '/groups/:groupId/accept', acceptGroupInviteRoute);
router.add('GET', '/groups/:groupId/expenses', listExpensesRoute);
router.add('POST', '/groups/:groupId/expenses', submitExpenseRoute);
router.add('POST', '/groups/:groupId/settlements', recordSettlementRoute);

// The mobile client's own requests (native fetch on iOS/Android) never
// enforce CORS, so this went unnoticed until browser-based testing hit it —
// a browser blocks the response outright without these headers on a
// cross-origin request. Wide open (`*`) rather than an allowlist: this API
// takes a bearer token for anything sensitive, not cookies, so there's no
// CSRF-via-credentialed-CORS risk a stricter origin list would guard against.
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/') {
      return withCors(await handleExtraction(request, env));
    }

    const routed = await router.handle(request, env);
    if (routed) {
      return withCors(routed);
    }

    return withCors(genericJsonResponse({ status: 'error', message: 'Not found.' }, 404));
  },
} satisfies ExportedHandler<Env>;
