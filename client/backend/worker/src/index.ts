import { extractReceiptViaVisionLLM } from './extract';
import type { ExtractionResponse } from './types';
import type { Env } from './env';
import { jsonResponse as genericJsonResponse } from './http';
import { createRouter } from './router';
import { requestOtp, verifyOtp } from './routes/auth';
import {
  createHouseholdRoute,
  getHouseholdRoute,
  inviteMemberRoute,
  listExpensesRoute,
  listHouseholdsRoute,
  submitExpenseRoute,
} from './routes/households';
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

// Household API routes (accounts, groups, ledger) — entirely additive
// alongside the extraction route above, which every existing client build
// keeps hitting at POST / exactly as before.
const router = createRouter<Env>();
router.add('POST', '/auth/otp/request', requestOtp);
router.add('POST', '/auth/otp/verify', verifyOtp);
router.add('POST', '/households', createHouseholdRoute);
router.add('GET', '/households', listHouseholdsRoute);
router.add('GET', '/households/:householdId', getHouseholdRoute);
router.add('POST', '/households/:householdId/members', inviteMemberRoute);
router.add('GET', '/households/:householdId/expenses', listExpensesRoute);
router.add('POST', '/households/:householdId/expenses', submitExpenseRoute);
router.add('POST', '/households/:householdId/settlements', recordSettlementRoute);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/') {
      return handleExtraction(request, env);
    }

    const routed = await router.handle(request, env);
    if (routed) {
      return routed;
    }

    return genericJsonResponse({ status: 'error', message: 'Not found.' }, 404);
  },
} satisfies ExportedHandler<Env>;
