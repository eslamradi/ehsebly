import { arrayBufferToBase64, detectImageMediaType } from './extract';

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
// 3.1 Flash-Lite — 2.5 Flash and 2.5 Flash-Lite both return a hard 404
// ("no longer available to new users") for a freshly created API key, so
// they're not actually usable here despite still being listed by
// ListModels. Of what a new key can actually call, 3.1 Flash-Lite is the
// cheapest ($0.25/$1.50 per MTok vs Sonnet 5's $2/$10) — plain 3.5 Flash
// is priced close enough to Sonnet that this whole two-tier strategy would
// need a ~94% accept rate just to break even; 3.1 Flash-Lite's breakeven
// is only ~16%, a much safer bet given real accuracy is still unverified
// for this task at time of writing.
const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// Cheap-tier call — fails fast into the Sonnet fallback rather than eating
// into the fronter's overall wait twice. Shorter than extract.ts's Sonnet
// budget deliberately: if Gemini is struggling this much to respond, it's
// not going to be a trustworthy answer anyway.
const GEMINI_TIMEOUT_MS = 25_000;
const GEMINI_TIMEOUT_MS_MULTI_IMAGE = 40_000;

// Mirrors extract.ts's EXTRACT_RECEIPT_TOOL schema field-for-field, with one
// addition: every field the accept/reject gate cares about (extract.ts's
// isGeminiResultAcceptable) also carries a `confidence` number from 0
// (guessing) to 1 (certain). flat_fees/image_mismatch aren't part of the
// gate, so they don't need confidence.
const CONFIDENCE_FIELD = {
  type: 'number',
  description:
    'How confident you are that this was read correctly off the image, from 0 (pure guess) to 1 (certain). Be honest and calibrated, not optimistic — if a digit or word was blurry, ambiguous, or you had to infer rather than read it directly, this should be noticeably lower than 1.',
};

const GEMINI_RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description:
        'Every line item that was actually part of the final charged order. Empty array if the photo is not a legible receipt/order screen or has no plausible line items. On a delivery-app screenshot, skip anything shown under a "Removed", "Cancelled", or "Refunded" heading — those were taken back out of the order and must not be counted.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "The item's printed name." },
          price_egp_text: {
            type: 'string',
            description:
              "The item's price exactly as printed, digits only — e.g. \"45.50\", \"12\", \"1,266.00\". Transcribe only; do not convert units or perform any calculation. This is the line's total price, not a per-unit price.",
          },
          quantity: {
            type: 'integer',
            description:
              'The quantity printed for this line, e.g. 10 if the receipt shows "10x Water", a quantity column reads 10, or an app screenshot shows a "1" badge on the item. Default to 1 for a normal single-item line with no quantity printed or implied.',
          },
          discount_percent: {
            type: ['number', 'null'],
            description:
              'A percentage discount printed against this specific item. Null if none. Never infer or compute a percentage yourself — transcribe only what is printed.',
          },
          discount_flat_egp_text: {
            type: ['string', 'null'],
            description:
              'A flat EGP discount amount printed against this specific item, digits only. Null if none. If both a percentage and flat amount could apply, report only the one explicitly printed.',
          },
          confidence: CONFIDENCE_FIELD,
        },
        required: ['name', 'price_egp_text', 'quantity', 'discount_percent', 'discount_flat_egp_text', 'confidence'],
      },
    },
    tax_line: {
      type: ['object', 'null'],
      description:
        'The receipt\'s explicit tax line, if one is printed. Report it whenever a tax line appears, whether it shows a percentage, an amount, or both. Null only if no tax line is visible.',
      properties: {
        rate_percent: {
          type: ['number', 'null'],
          description: 'The printed rate as a percentage, e.g. 14 for "Tax 14%". Null if only an amount is shown — never infer a percentage from an amount.',
        },
        amount_egp_text: {
          type: ['string', 'null'],
          description: 'The amount printed on this line, exactly as printed, digits only — e.g. "63.00". Transcribe it whenever shown; never compute it from the rate. Null only if no amount is printed beside the percentage.',
        },
        included_in_prices: {
          type: 'boolean',
          description: 'True when the receipt states this charge is ALREADY inside the item prices rather than added on top (e.g. "prices include VAT", "الأسعار شاملة الضريبة"). False for the usual case of a charge added to the subtotal.',
        },
        confidence: CONFIDENCE_FIELD,
      },
      required: ['rate_percent', 'amount_egp_text', 'included_in_prices', 'confidence'],
    },
    service_line: {
      type: ['object', 'null'],
      description:
        'The receipt\'s explicit service line, if one is printed. Report it whenever a service line appears, whether it shows a percentage, an amount, or both. Null only if no service line is visible.',
      properties: {
        rate_percent: {
          type: ['number', 'null'],
          description: 'The printed rate as a percentage, e.g. 12 for "Service 12%". Null if only an amount is shown — never infer a percentage from an amount.',
        },
        amount_egp_text: {
          type: ['string', 'null'],
          description: 'The amount printed on this line, exactly as printed, digits only — e.g. "63.00". Transcribe it whenever shown; never compute it from the rate. Null only if no amount is printed beside the percentage.',
        },
        included_in_prices: {
          type: 'boolean',
          description: 'True when the receipt states this charge is ALREADY inside the item prices rather than added on top (e.g. "prices include VAT", "الأسعار شاملة الضريبة"). False for the usual case of a charge added to the subtotal.',
        },
        confidence: CONFIDENCE_FIELD,
      },
      required: ['rate_percent', 'amount_egp_text', 'included_in_prices', 'confidence'],
    },
    discount_line: {
      type: ['object', 'null'],
      description:
        'The receipt\'s single explicit discount line applied to the WHOLE order (e.g. a delivery-app "Discount" line), as opposed to a discount printed against one specific item. Provide EITHER a flat EGP amount OR a percentage, whichever is printed — never both. Null if no order-wide discount line is visible.',
      properties: {
        amount_egp_text: {
          type: ['string', 'null'],
          description: 'The order-wide discount\'s flat amount exactly as printed, digits only, no minus sign. Null if it\'s a percentage instead.',
        },
        rate_percent: {
          type: ['number', 'null'],
          description: 'The order-wide discount\'s rate as a percentage, if printed as one instead of a flat amount. Null if it\'s a flat amount instead.',
        },
        confidence: CONFIDENCE_FIELD,
      },
      required: ['amount_egp_text', 'rate_percent', 'confidence'],
    },
    flat_fees: {
      type: 'array',
      description:
        'Any additional named charge lines that print a flat amount with no percentage — e.g. "Delivery fee", "Service fee". Do not include a line already captured in tax_line, service_line, or discount_line. Empty array if none.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The fee\'s printed label.' },
          amount_egp_text: { type: 'string', description: 'The flat fee amount exactly as printed, digits only.' },
        },
        required: ['name', 'amount_egp_text'],
      },
    },
    printed_total_text: {
      type: ['string', 'null'],
      description: "The receipt's printed final total, exactly as printed, digits only. Null if no total line is visible or legible.",
    },
    printed_total_confidence: {
      type: ['number', 'null'],
      description: 'Confidence (0 to 1) that the printed total was read correctly. Null if printed_total_text is null.',
    },
    image_mismatch: {
      type: 'boolean',
      description:
        'True only if multiple images were provided AND they do not appear to be the same single order or receipt. False if only one image was given, or multiple images clearly belong together.',
    },
    image_mismatch_note: {
      type: ['string', 'null'],
      description: 'If image_mismatch is true, a short plain-language note on what looked mismatched. Null otherwise.',
    },
  },
  required: [
    'items',
    'tax_line',
    'service_line',
    'discount_line',
    'flat_fees',
    'printed_total_text',
    'printed_total_confidence',
    'image_mismatch',
    'image_mismatch_note',
  ],
} as const;

export type GeminiExtractToolInput = {
  items: Array<{
    name: string;
    price_egp_text: string;
    quantity: number;
    discount_percent: number | null;
    discount_flat_egp_text: string | null;
    confidence: number;
  }>;
  tax_line: {
    rate_percent: number | null;
    amount_egp_text: string | null;
    included_in_prices: boolean;
    confidence: number;
  } | null;
  service_line: {
    rate_percent: number | null;
    amount_egp_text: string | null;
    included_in_prices: boolean;
    confidence: number;
  } | null;
  discount_line: { amount_egp_text: string | null; rate_percent: number | null; confidence: number } | null;
  flat_fees: Array<{ name: string; amount_egp_text: string }>;
  printed_total_text: string | null;
  printed_total_confidence: number | null;
  image_mismatch: boolean;
  image_mismatch_note: string | null;
};

export type TokenUsage = { inputTokens: number; outputTokens: number };

export type GeminiExtractResult = { toolInput: GeminiExtractToolInput; usage: TokenUsage | null };

/**
 * Calls Gemini 3.1 Flash-Lite for a first-pass, cheap extraction attempt.
 * Never throws and never surfaces a partial/malformed result — returns null
 * on ANY failure (network, non-2xx, unparseable JSON, schema mismatch), so
 * the caller (extract.ts's extractReceipt) can unconditionally fall back to
 * Sonnet without needing to distinguish failure modes. `usage` is null only
 * if the response was missing/malformed usage data — the extraction itself
 * can still succeed without it (cost just can't be logged for that call).
 */
export async function extractReceiptViaGemini(imagesBytes: ArrayBuffer[], apiKey: string): Promise<GeminiExtractResult | null> {
  // The "any line labeled Tax/VAT/GST with a percentage is tax_line, never
  // flat_fees" sentence exists because Gemini repeatedly misclassified a
  // printed "VAT 14%" line as a flat fee named "VAT" instead of tax_line
  // with rate_percent 14 (found via the French-menu receipt test case,
  // 2026-08-02/03) — the total still reconciled either way (a flat "VAT"
  // fee and a proportional 14% tax happened to sum to the same number on
  // that receipt), so the numeric reconciliation gate alone couldn't catch
  // it. This matters beyond that one receipt: a flat fee gets split
  // equally among everyone on the app's assignment screen, while tax_line
  // gets split proportionally to what each person actually ordered — a
  // real fairness difference when people order unevenly, not a cosmetic
  // one.
  // "You saved EGP 4" on a Breadfast order (2026-08-09) was read as a
  // discount_line on roughly half of repeated runs, which would have charged
  // the table 235.00 against a printed 239.00. The badge measures against a
  // list price the item prices already reflect — the printed total never
  // subtracted it. The instruction to catch discounts "in a different
  // colour/highlight" was actively recruiting exactly this false positive,
  // so the counter-rule has to be arithmetic, not visual.
  const PROMOTIONAL_SAVINGS_HINT =
    'A discount only counts if the printed total actually reflects it. "You saved 4", "You save 20%", loyalty-points messaging and struck-through list prices are promotional badges measuring against a list price the item prices already account for — they are NOT discount lines, however prominently or colourfully displayed. Test before reporting one: if items + fees + printed taxes already equals the printed total on its own, discount_line must be null. Only report a discount when subtracting it is what makes the arithmetic reach the printed total.';

  const TAX_SERVICE_CLASSIFICATION_HINT =
    'Any line labeled "Tax", "VAT", "GST", or similar with a percentage printed next to it (e.g. "VAT 14%") is tax_line, never flat_fees — even if the percentage isn\'t immediately beside the label, look for it nearby before concluding it\'s a flat amount. Same rule for "Service"/"Service charge" lines and service_line. Only put a fee in flat_fees when NO percentage is printed for it anywhere on the receipt.';

  const promptText =
    imagesBytes.length > 1
      ? `These ${imagesBytes.length} images may be multiple photos or screenshots of the SAME single restaurant receipt or delivery-app order. First check whether they actually do belong to the same single order (same restaurant/store, same order ID if visible, consistent totals). If they do, merge every unique charged line item across all images into a single list, don't double-count an overlapping line, and extract any explicit tax/service percentage lines and any flat named fee lines. ${TAX_SERVICE_CLASSIFICATION_HINT} Always check carefully for a "Discount", "Coupon", or "Promo" line near Subtotal/Delivery fee/Service fee/Total. ${PROMOTIONAL_SAVINGS_HINT} If they do NOT belong together, set image_mismatch to true and briefly explain why in image_mismatch_note, but still extract every field from whichever single image represents one complete, coherent order. Skip anything shown as removed/cancelled/refunded. For every field, also report a calibrated confidence score as described in the schema — this matters a lot here, so take it seriously rather than defaulting to a high number.`
      : `This is a photo of a restaurant receipt, or a screenshot of a food/grocery delivery app's order-summary screen. Extract every charged line item (skipping anything shown as removed/cancelled/refunded), any explicit tax/service percentage lines, any flat named fee lines, and any order-wide discount/coupon/promo line — these are easy to skim past but change the total. ${PROMOTIONAL_SAVINGS_HINT} ${TAX_SERVICE_CLASSIFICATION_HINT} For every field, also report a calibrated confidence score as described in the schema — this matters a lot here, so take it seriously rather than defaulting to a high number.`;

  const controller = new AbortController();
  const timeoutMs = imagesBytes.length > 1 ? GEMINI_TIMEOUT_MS_MULTI_IMAGE : GEMINI_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: [
          { type: 'text', text: promptText },
          ...imagesBytes.map((bytes) => ({
            type: 'image',
            data: arrayBufferToBase64(bytes),
            mime_type: detectImageMediaType(bytes),
          })),
        ],
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: GEMINI_RECEIPT_SCHEMA,
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    console.error('extractReceiptViaGemini: fetch to Gemini API failed', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  if (!response.ok) {
    console.error('extractReceiptViaGemini: Gemini API returned', response.status, responseText);
    return null;
  }

  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch (error) {
    console.error('extractReceiptViaGemini: response body was not valid JSON', error, responseText);
    return null;
  }

  const outputText = extractOutputText(body);
  if (outputText === null) {
    console.error('extractReceiptViaGemini: response had no extractable output text', responseText);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    console.error('extractReceiptViaGemini: output_text was not valid JSON', error, outputText);
    return null;
  }

  if (!isValidGeminiToolInput(parsed)) {
    console.error('extractReceiptViaGemini: output did not match the expected schema', outputText);
    return null;
  }
  return { toolInput: parsed, usage: extractUsage(body) };
}

/**
 * Pulls real token counts out of the interactions response's top-level
 * `usage` object (`total_input_tokens`/`total_output_tokens` — confirmed
 * against a live response; not documented the same way `output_text` was
 * wrongly documented, so this is deliberately defensive rather than
 * assumed-correct).
 */
function extractUsage(body: unknown): TokenUsage | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const usage = (body as { usage?: unknown }).usage;
  if (typeof usage !== 'object' || usage === null) {
    return null;
  }
  const inputTokens = (usage as { total_input_tokens?: unknown }).total_input_tokens;
  const outputTokens = (usage as { total_output_tokens?: unknown }).total_output_tokens;
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    return null;
  }
  return { inputTokens, outputTokens };
}

/**
 * Pulls the generated text out of a /v1beta/interactions response. Despite
 * the docs describing a top-level `output_text` convenience field, the
 * actual API response carries no such field — the real shape is
 * `steps: [{type: "thought", ...}, {type: "model_output", content: [{type:
 * "text", text: "..."}]}]`. Checks for `output_text` first anyway (cheap,
 * and forward-compatible if a future response shape adds it back), then
 * falls through to joining every text block across every `model_output`
 * step — mirroring what the docs say `output_text` itself does ("joins
 * consecutive text content blocks"), in case a response ever splits the
 * JSON across more than one block/step.
 */
function extractOutputText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const topLevel = (body as { output_text?: unknown }).output_text;
  if (typeof topLevel === 'string') {
    return topLevel;
  }

  const steps = (body as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) {
    return null;
  }
  const textParts: string[] = [];
  for (const step of steps) {
    if (typeof step !== 'object' || step === null) {
      continue;
    }
    if ((step as { type?: unknown }).type !== 'model_output') {
      continue;
    }
    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content) {
      if (
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string'
      ) {
        textParts.push((block as { text: string }).text);
      }
    }
  }
  return textParts.length > 0 ? textParts.join('') : null;
}

function isValidConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isValidNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

const MAX_ITEM_QUANTITY = 500;
const MAX_RATE_PERCENT = 100;

function isValidGeminiToolInput(input: unknown): input is GeminiExtractToolInput {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  const candidate = input as Record<string, unknown>;

  if (!Array.isArray(candidate.items)) {
    return false;
  }
  const itemsValid = candidate.items.every((item) => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    const i = item as Record<string, unknown>;
    return (
      typeof i.name === 'string' &&
      typeof i.price_egp_text === 'string' &&
      typeof i.quantity === 'number' &&
      Number.isInteger(i.quantity) &&
      i.quantity >= 1 &&
      i.quantity <= MAX_ITEM_QUANTITY &&
      (i.discount_percent === null || (typeof i.discount_percent === 'number' && i.discount_percent >= 0 && i.discount_percent <= 100)) &&
      isValidNullableString(i.discount_flat_egp_text) &&
      isValidConfidence(i.confidence)
    );
  });
  if (!itemsValid) {
    return false;
  }

  if (!Array.isArray(candidate.flat_fees)) {
    return false;
  }
  const flatFeesValid = candidate.flat_fees.every(
    (fee) =>
      typeof fee === 'object' &&
      fee !== null &&
      typeof (fee as { name?: unknown }).name === 'string' &&
      typeof (fee as { amount_egp_text?: unknown }).amount_egp_text === 'string',
  );
  if (!flatFeesValid) {
    return false;
  }

  const isValidRateLineWithConfidence = (value: unknown): boolean => {
    if (value === null) {
      return true;
    }
    if (typeof value !== 'object') {
      return false;
    }
    const v = value as Record<string, unknown>;
    return (
      typeof v.rate_percent === 'number' &&
      Number.isFinite(v.rate_percent) &&
      v.rate_percent >= 0 &&
      v.rate_percent <= MAX_RATE_PERCENT &&
      isValidConfidence(v.confidence)
    );
  };
  if (!isValidRateLineWithConfidence(candidate.tax_line) || !isValidRateLineWithConfidence(candidate.service_line)) {
    return false;
  }

  if (candidate.discount_line !== null) {
    if (typeof candidate.discount_line !== 'object' || candidate.discount_line === null) {
      return false;
    }
    const d = candidate.discount_line as Record<string, unknown>;
    if (!isValidNullableString(d.amount_egp_text) || !isValidConfidence(d.confidence)) {
      return false;
    }
    if (d.rate_percent !== null && !(typeof d.rate_percent === 'number' && d.rate_percent >= 0 && d.rate_percent <= MAX_RATE_PERCENT)) {
      return false;
    }
  }

  if (!isValidNullableString(candidate.printed_total_text)) {
    return false;
  }
  if (candidate.printed_total_confidence !== null && !isValidConfidence(candidate.printed_total_confidence)) {
    return false;
  }
  if (typeof candidate.image_mismatch !== 'boolean') {
    return false;
  }
  if (!isValidNullableString(candidate.image_mismatch_note)) {
    return false;
  }

  return true;
}
