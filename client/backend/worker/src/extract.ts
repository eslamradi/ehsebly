import { parsePrintedPriceToPiastres, roundHalfUp } from './money';
import type { ExtractedItem, ExtractionResponse, FlatFeeLine } from './types';
import type { Env } from './env';
import { extractReceiptViaGemini, type GeminiExtractToolInput, type TokenUsage } from './geminiExtract';
import { errorBody } from './errors';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Sonnet 5, not Opus — this is a forced structured-output tool call (read
// printed digits off a photo), not a reasoning task, and Sonnet 5 is
// near-Opus quality on extraction/vision work at roughly 60% lower cost.
const MODEL = 'claude-sonnet-5';

// Extraction is a single structured-output call, not a reasoning task — no
// need to wait indefinitely. Budget has to cover the actual photo upload
// (a few hundred KB to a few MB, base64-encoded, per image) plus vision
// processing, not just the model call itself — 20s proved too tight over a
// slower connection (mobile hotspot) during the 10-dinner test. 45s keeps a
// genuinely stuck upstream call from hanging the fronter's screen
// indefinitely (AC #5: timeouts collapse into the same {status: "error"}
// shape as any other Worker-side failure). Multi-image requests get a
// larger flat budget — more images means more upload bytes and more vision
// processing per call, not a fixed per-image increment (the model reads
// them together, not sequentially).
const VISION_LLM_TIMEOUT_MS = 45_000;
const VISION_LLM_TIMEOUT_MS_MULTI_IMAGE = 75_000;

const EXTRACT_RECEIPT_TOOL = {
  name: 'extract_receipt',
  description:
    'Extract every charged line item, any explicit tax/service percentage lines, and any flat named fee lines from a photographed restaurant receipt or a delivery-app order-summary screenshot.',
  input_schema: {
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
                'A percentage discount printed against this specific item, e.g. 10 for "10% off" shown on or right next to this line. Null if no discount percentage is printed for this item. Never infer or compute a percentage yourself — transcribe only what is printed.',
            },
            discount_flat_egp_text: {
              type: ['string', 'null'],
              description:
                'A flat EGP discount amount printed against this specific item (subtracted from the line\'s price_egp_text), digits only — e.g. "20.00". Null if no flat discount is printed for this item. If both a percentage and a flat amount appear to apply to the same item, report only the one explicitly printed for it; do not report both.',
            },
          },
          required: ['name', 'price_egp_text', 'quantity', 'discount_percent', 'discount_flat_egp_text'],
          additionalProperties: false,
        },
      },
      tax_line: {
        type: ['object', 'null'],
        description:
          'The receipt\'s explicit tax line and rate, ONLY if a percentage is actually printed next to it (e.g. "Tax 14%"). Null if no tax line is visible, or if a tax-like line exists but only shows a flat amount with no percentage printed — never compute or infer a percentage from a flat amount yourself; use flat_fees for that case instead.',
        properties: {
          rate_percent: {
            type: 'number',
            description: 'The printed tax rate as a percentage, e.g. 14 for 14%.',
          },
        },
        required: ['rate_percent'],
        additionalProperties: false,
      },
      service_line: {
        type: ['object', 'null'],
        description:
          'The receipt\'s explicit service charge line and rate, ONLY if a percentage is actually printed next to it (e.g. "Service 12%"). Null if no service line is visible, or if a "Service fee" line exists but only shows a flat amount with no percentage printed (very common on delivery-app screenshots) — never compute or infer a percentage from a flat amount yourself; use flat_fees for that case instead.',
        properties: {
          rate_percent: {
            type: 'number',
            description: 'The printed service rate as a percentage, e.g. 12 for 12%.',
          },
        },
        required: ['rate_percent'],
        additionalProperties: false,
      },
      discount_line: {
        type: ['object', 'null'],
        description:
          'The receipt\'s single explicit discount line applied to the WHOLE order — e.g. a delivery-app "Discount" line, or a receipt-wide coupon/promo — as opposed to a discount printed against one specific item (that\'s each item\'s own discount_percent/discount_flat_egp_text instead). Provide EITHER a flat EGP amount OR a percentage, whichever is actually printed — never both, never compute one from the other. Null if no order-wide discount line is visible.',
        properties: {
          amount_egp_text: {
            type: ['string', 'null'],
            description:
              'The order-wide discount\'s flat amount exactly as printed, digits only, no minus sign — e.g. "47.25". Null if the discount is printed as a percentage instead.',
          },
          rate_percent: {
            type: ['number', 'null'],
            description:
              'The order-wide discount\'s rate as a percentage, e.g. 10 for "10% off", if printed as a percentage rather than a flat amount. Null if the discount is a flat amount instead.',
          },
        },
        required: ['amount_egp_text', 'rate_percent'],
        additionalProperties: false,
      },
      flat_fees: {
        type: 'array',
        description:
          'Any additional named charge lines that print a flat amount with no percentage — e.g. "Delivery fee", "Service fee", "Preparation fee" on a delivery-app order screen. Do not include a line already captured in tax_line, service_line, or discount_line. Skip a fee that\'s printed as exactly 0 only if you\'re unsure it was actually a real line — when in doubt, include it. Empty array if none.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The fee\'s printed label, e.g. "Delivery fee", "Preparation fee".' },
            amount_egp_text: {
              type: 'string',
              description:
                'The flat fee amount exactly as printed, digits only — e.g. "20", "18.11". Transcribe only; do not calculate.',
            },
          },
          required: ['name', 'amount_egp_text'],
          additionalProperties: false,
        },
      },
      printed_total_text: {
        type: ['string', 'null'],
        description:
          "The receipt's printed final total, exactly as printed, digits only — e.g. \"234.93\". Transcribe only; do not convert units or perform any calculation. Null if no total line is visible or legible.",
      },
      image_mismatch: {
        type: 'boolean',
        description:
          'True only if multiple images were provided AND they do not appear to be photos/screenshots of the same single order or receipt — e.g. different restaurant/store names, different order IDs, unrelated item sets or totals that cannot plausibly be one purchase. False if only one image was given, or if multiple images clearly belong together (e.g. a receipt continued across a scroll).',
      },
      image_mismatch_note: {
        type: ['string', 'null'],
        description:
          'If image_mismatch is true, a short plain-language note on what looked mismatched (e.g. which image is which order). Null if image_mismatch is false.',
      },
    },
    required: [
      'items',
      'tax_line',
      'service_line',
      'discount_line',
      'flat_fees',
      'printed_total_text',
      'image_mismatch',
      'image_mismatch_note',
    ],
    additionalProperties: false,
  },
  strict: true,
} as const;

type ExtractReceiptToolInput = {
  items: Array<{
    name: string;
    price_egp_text: string;
    quantity: number;
    discount_percent: number | null;
    discount_flat_egp_text: string | null;
  }>;
  tax_line: { rate_percent: number } | null;
  service_line: { rate_percent: number } | null;
  discount_line: { amount_egp_text: string | null; rate_percent: number | null } | null;
  flat_fees: Array<{ name: string; amount_egp_text: string }>;
  printed_total_text: string | null;
  image_mismatch: boolean;
  image_mismatch_note: string | null;
};

// Shared extraction rules — single source of truth so the single-image and
// multi-image prompt variants below can't drift from each other the way the
// old two independent template strings did.
const RECEIPT_RULES = `Rules:
- Extract every charged line item. Skip anything shown as removed, cancelled, or refunded.
- Receipts may be in Arabic, English, or mixed. Keep item names exactly as printed — do not translate.
- Convert Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) to Western digits. Output amounts as plain numbers, stripping currency symbols/words (EGP, LE, ج.م, جنيه).
- price_egp_text is always the line's total, never a per-unit price — even when a unit price is printed alongside the quantity (e.g. "2x Pepsi @ 20.00" → record "40.00", not "20.00"). The only time arithmetic is required: if a line shows a per-unit price and quantity with no total printed anywhere for that line, multiply unit price × quantity yourself to get the total.
- Fold priced add-ons/modifiers (e.g. "+ Extra cheese 15.00") into their parent item's line total and append them to the item name.
- Capture explicit tax or service-charge percentage lines, and every flat named fee line (delivery fee, service fee, preparation fee, tip, donation/round-up, etc.).
- Only report tax lines that are literally printed as separate charges. Egyptian delivery apps usually show VAT-inclusive prices — never infer or compute a tax line that is not printed.
- Check line by line for a "Discount", "Coupon", or "Promo" line near Subtotal / fees / Total — these are easy to skim past but change the total. Report it in discount_line whenever one is printed, even faintly or in a different color/highlight than the surrounding text.
- But a discount only counts if the printed total actually reflects it. "You saved 4", "You save 20%", loyalty-points messaging, and struck-through list prices are promotional badges measuring against a list price that the item prices already account for — they are NOT discount lines, however prominently or colourfully they are displayed. Test before reporting one: if items + fees + printed taxes already equals the printed total on its own, there is no discount to report and discount_line must be null. Only report a discount when subtracting it is what makes the arithmetic reach the printed total.
- Sanity-check: items + fees + printed taxes − discounts should equal the printed total (allow ±0.05 rounding). If it doesn't, re-examine the image for misread digits (1/7, 0/8, 5/6) and fix only what the image visibly supports. If it still doesn't reconcile, keep every value exactly as printed — never adjust numbers just to force the math to work.
- Use the extract_receipt tool.`;

const SINGLE_IMAGE_INTRO =
  "This is a photo of a restaurant or store receipt, or a screenshot of a food/grocery delivery app's order-summary screen.";

const multiImageIntro = (n: number) =>
  `These ${n} images may be multiple photos or screenshots of ONE order — e.g. a long paper receipt photographed in parts, or scrolling screenshots of a single order-summary screen.
1. Verify they belong to the same single order: same restaurant/store, same order ID if visible, consistent amounts.
2. If they match, merge every unique charged line item across all images. A line repeated across two images at their overlap is ONE line — count it once. Identical lines within a single image are genuinely separate items — keep both. Use item order and running amounts to align overlapping regions.
3. If they do NOT match (different merchants, different orders, unrelated items), set image_mismatch to true and briefly explain why in image_mismatch_note — then extract every field as normal from the single most complete image, preferring the one that shows the grand total, exactly as if it were the only image provided. Never leave items/totals empty because of a mismatch; leave them empty only if no image contains a legible order at all.`;

/**
 * Calls the vision-LLM API with the receipt photo and returns one of the
 * three AD-4 shapes. Never throws — every failure path (timeout, non-2xx,
 * malformed response) is caught and mapped to {status: "error"}.
 */
export async function extractReceiptViaVisionLLM(imagesBytes: ArrayBuffer[], apiKey: string): Promise<ExtractionResponse> {
  return (await callSonnetForExtraction(imagesBytes, apiKey)).result;
}

/**
 * Does the actual Sonnet call and also returns real token usage, so
 * extractReceipt can log real cost data. extractReceiptViaVisionLLM stays
 * as a thin wrapper around this — same public shape as before this
 * function existed, for any external caller that only wants the
 * ExtractionResponse and doesn't care about usage.
 */
async function callSonnetForExtraction(
  imagesBytes: ArrayBuffer[],
  apiKey: string,
): Promise<{ result: ExtractionResponse; usage: TokenUsage | null }> {
  const imageBlocks = imagesBytes.map((bytes) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: detectImageMediaType(bytes),
      data: arrayBufferToBase64(bytes),
    },
  }));

  const promptText =
    imagesBytes.length > 1
      ? `${multiImageIntro(imagesBytes.length)}\n\n${RECEIPT_RULES}`
      : `${SINGLE_IMAGE_INTRO}\n\n${RECEIPT_RULES}`;

  const controller = new AbortController();
  const timeoutMs = imagesBytes.length > 1 ? VISION_LLM_TIMEOUT_MS_MULTI_IMAGE : VISION_LLM_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        // Sonnet 5 runs adaptive thinking by default when this is omitted
        // (unlike Opus, which defaults to off) — disabled explicitly to
        // keep the same latency/cost profile this Worker had on Opus, since
        // a forced single tool call has no real use for extended reasoning.
        thinking: { type: 'disabled' },
        tools: [EXTRACT_RECEIPT_TOOL],
        tool_choice: { type: 'tool', name: 'extract_receipt' },
        messages: [
          {
            role: 'user',
            content: [...imageBlocks, { type: 'text', text: promptText }],
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    // Network failure or AbortController timeout — both collapse to the
    // same error shape the client already handles (AC #5).
    console.error('extractReceiptViaVisionLLM: fetch to vision-LLM API failed', error);
    return { result: errorBody('extractionUnreachable'), usage: null };
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();

  if (!response.ok) {
    // Log the actual response body, not just the status — the body carries
    // the real reason (e.g. Anthropic's `error.message`), which the status
    // code alone doesn't explain when this needs debugging later.
    console.error('extractReceiptViaVisionLLM: vision-LLM API returned', response.status, responseText);
    // The upstream status is diagnostic, not copy — it goes to the log, and
    // the client shows a localized message for the code.
    return { result: errorBody('extractionUpstreamError'), usage: null };
  }

  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch (error) {
    console.error('extractReceiptViaVisionLLM: response body was not valid JSON', error, responseText);
    return { result: errorBody('extractionUnreadable'), usage: null };
  }

  const usage = extractSonnetUsage(body);

  if (isTruncatedResponse(body)) {
    console.error('extractReceiptViaVisionLLM: response was truncated (stop_reason: max_tokens)');
    return {
      result: errorBody('extractionTruncated'),
      usage,
    };
  }

  const toolInput = extractToolInput(body);
  if (!toolInput) {
    console.error('extractReceiptViaVisionLLM: tool call input did not match the expected shape');
    return { result: errorBody('extractionMalformed'), usage };
  }

  return { result: buildExtractionResponse(toolInput, 'extractReceiptViaVisionLLM'), usage };
}

/** Anthropic's Messages API response carries `usage: {input_tokens, output_tokens}` at the top level. */
function extractSonnetUsage(body: unknown): TokenUsage | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const usage = (body as { usage?: unknown }).usage;
  if (typeof usage !== 'object' || usage === null) {
    return null;
  }
  const inputTokens = (usage as { input_tokens?: unknown }).input_tokens;
  const outputTokens = (usage as { output_tokens?: unknown }).output_tokens;
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    return null;
  }
  return { inputTokens, outputTokens };
}

/**
 * Deterministically parses each item's printed price/discount into net
 * piastres — shared between the Sonnet and Gemini paths so the money math
 * (and the discount-reduces-the-line-price rule) has exactly one
 * implementation. Returns null if any item's price or discount text isn't a
 * plain non-negative decimal — a genuine transcription problem, not a
 * conversion error, and the caller rejects the whole extraction rather than
 * guess at a price.
 */
function parseItems(
  rawItems: Array<{ name: string; price_egp_text: string; quantity: number; discount_percent: number | null; discount_flat_egp_text: string | null }>,
): { items: ExtractedItem[]; discountedItemCount: number } | null {
  const items: ExtractedItem[] = [];
  let discountedItemCount = 0;
  for (const item of rawItems) {
    const rawPiastres = parsePrintedPriceToPiastres(item.price_egp_text);
    if (rawPiastres === null) {
      return null;
    }

    // A per-item discount reduces this item's price before it ever
    // contributes to the subtotal — service% and tax% then compound on top
    // of the already-discounted amount exactly as they do for any other
    // item, so no separate discount-aware branch is needed in
    // splitCalculation.ts. Same deterministic-arithmetic rule as the price
    // itself: the model transcribes what's printed, this Worker computes
    // the net piastres.
    let piastres = rawPiastres;
    if (item.discount_flat_egp_text !== null) {
      const discountPiastres = parsePrintedPriceToPiastres(item.discount_flat_egp_text);
      if (discountPiastres === null || discountPiastres > rawPiastres) {
        return null;
      }
      piastres = rawPiastres - discountPiastres;
      discountedItemCount += 1;
    } else if (item.discount_percent !== null) {
      piastres = roundHalfUp((rawPiastres * (100 - item.discount_percent)) / 100);
      discountedItemCount += 1;
    }

    items.push({ name: item.name, price_piastres: piastres, quantity: item.quantity });
  }
  return { items, discountedItemCount };
}

/**
 * Turns a validated raw tool input (from either Sonnet or an accepted
 * Gemini result, confidence fields already stripped) into the AD-4
 * response shape. Single source of truth for the money math so Sonnet and
 * Gemini can never drift apart on how a price/discount/fee gets computed.
 */
function buildExtractionResponse(toolInput: ExtractReceiptToolInput, sourceLabel: string): ExtractionResponse {
  const parsed = parseItems(toolInput.items);
  if (parsed === null) {
    console.error(`${sourceLabel}: unparseable price or discount text among items`);
    return errorBody('extractionUnreadablePrice');
  }
  const { items, discountedItemCount } = parsed;

  if (items.length === 0) {
    return { status: 'no_items_found' };
  }

  const result: ExtractionResponse = { status: 'ok', items };
  if (discountedItemCount > 0) {
    result.discount_note = `Discount applied to ${discountedItemCount} item${discountedItemCount === 1 ? '' : 's'} — the price${discountedItemCount === 1 ? '' : 's'} below already reflect it.`;
  }
  if (toolInput.tax_line) {
    result.tax_line = { rate_percent: toolInput.tax_line.rate_percent };
  }
  if (toolInput.service_line) {
    result.service_line = { rate_percent: toolInput.service_line.rate_percent };
  }
  if (toolInput.discount_line) {
    // Same soft-failure treatment as flat_fees/printed_total below — an
    // unparseable discount amount shouldn't invalidate an otherwise-good
    // item extraction; the fronter can toggle/edit the discount by hand on
    // TaxServiceScreen if it's ever wrong or missing.
    if (toolInput.discount_line.amount_egp_text !== null) {
      const discountPiastres = parsePrintedPriceToPiastres(toolInput.discount_line.amount_egp_text);
      if (discountPiastres !== null) {
        result.discount_line = { amount_piastres: discountPiastres };
      } else {
        console.error(`${sourceLabel}: unparseable discount_line amount, omitting`, toolInput.discount_line.amount_egp_text);
      }
    } else if (toolInput.discount_line.rate_percent !== null) {
      result.discount_line = { rate_percent: toolInput.discount_line.rate_percent };
    }
  }
  if (toolInput.flat_fees.length > 0) {
    // Same soft-failure treatment as the printed total below — a garbled
    // fee amount shouldn't invalidate an otherwise-good item extraction,
    // since the fronter reviews and can add it back by hand (Story: the
    // client's own "Add item" flow already covers this exact fallback).
    const flatFees: FlatFeeLine[] = [];
    for (const fee of toolInput.flat_fees) {
      const piastres = parsePrintedPriceToPiastres(fee.amount_egp_text);
      if (piastres === null) {
        console.error(`${sourceLabel}: unparseable flat fee amount, omitting`, fee.amount_egp_text);
        continue;
      }
      flatFees.push({ name: fee.name, amount_piastres: piastres });
    }
    if (flatFees.length > 0) {
      result.flat_fees = flatFees;
    }
  }
  if (toolInput.printed_total_text !== null) {
    // Unlike item prices, a bad Printed Total transcription doesn't fail
    // the whole extraction — it's a reconciliation nice-to-have (FR-10),
    // not a required field. Same deterministic parser as item prices
    // (no model arithmetic), just a softer failure mode.
    const printedTotalPiastres = parsePrintedPriceToPiastres(toolInput.printed_total_text);
    if (printedTotalPiastres !== null) {
      result.printed_total_piastres = printedTotalPiastres;
    } else {
      console.error(`${sourceLabel}: unparseable printed total text, omitting from response`, toolInput.printed_total_text);
    }
  }
  if (toolInput.image_mismatch && toolInput.image_mismatch_note) {
    // Multiple images were submitted as one order but the model determined
    // they're actually unrelated (verified against real mismatched
    // screenshots) — items/totals above still come from whichever single
    // image it judged coherent, so this is a warning to surface to the
    // fronter, not a reason to fail the extraction.
    result.image_mismatch_note = toolInput.image_mismatch_note;
  }
  return result;
}

// How confident Gemini must be, on EVERY populated field (minimum, not
// average — one badly-misread price is enough to ruin a split), before its
// result is trusted instead of paying for Sonnet. Budget math (2026-08-02):
// at Gemini 2.5 Flash's pricing ($0.30/$2.50 per MTok vs Sonnet 5's
// $2/$10), the breakeven accept rate is only ~23% — so this threshold can
// afford to be conservative/high without losing the economics.
const GEMINI_CONFIDENCE_THRESHOLD = 0.85;

// Same rounding-drift allowance the client's own reconciliation check uses
// (app/domain/reconciliation.ts's RECONCILIATION_TOLERANCE_PIASTRES) — kept
// in sync deliberately: this is the identical comparison, just run
// server-side and earlier, as a pre-flight trust gate rather than the final
// user-facing match/mismatch badge.
const GEMINI_RECONCILE_TOLERANCE_PIASTRES = 2;

/**
 * Recomputes the receipt total from Gemini's own extracted items/discount/
 * service/tax exactly the way the client's splitCalculation.ts does
 * (discount reduces the subtotal first, then service, then tax compounds on
 * top) — server-side, so isGeminiResultAcceptable can compare it against
 * Gemini's own printed_total_piastres before ever trusting the result.
 * Returns null if the discount_line amount doesn't parse.
 */
function computeReconciledTotalPiastres(toolInput: GeminiExtractToolInput, items: ExtractedItem[]): number | null {
  const subtotalPiastres = items.reduce((sum, item) => sum + item.price_piastres, 0);

  let discountPiastres = 0;
  if (toolInput.discount_line) {
    if (toolInput.discount_line.amount_egp_text !== null) {
      const parsedDiscount = parsePrintedPriceToPiastres(toolInput.discount_line.amount_egp_text);
      if (parsedDiscount === null) {
        return null;
      }
      discountPiastres = Math.min(parsedDiscount, subtotalPiastres);
    } else if (toolInput.discount_line.rate_percent !== null) {
      discountPiastres = roundHalfUp((subtotalPiastres * toolInput.discount_line.rate_percent) / 100);
    }
  }
  const discountedSubtotalPiastres = subtotalPiastres - discountPiastres;

  const servicePiastres = toolInput.service_line
    ? roundHalfUp((discountedSubtotalPiastres * toolInput.service_line.rate_percent) / 100)
    : 0;
  const taxBasePiastres = discountedSubtotalPiastres + servicePiastres;
  const taxPiastres = toolInput.tax_line ? roundHalfUp((taxBasePiastres * toolInput.tax_line.rate_percent) / 100) : 0;

  // flat_fees (a flat delivery/service-fee line with no percentage) never
  // goes through the discount/service/tax compounding — the client folds
  // each one in as an ordinary shared item, adding straight onto the total.
  // Omitting these here would make every receipt that has one look like a
  // reconciliation mismatch regardless of how accurately everything else
  // was read (found via the discount-receipt test case, 2026-08-02: a
  // flat "Service fee: 15.75" line was the entire gap, not a real error).
  let flatFeesPiastres = 0;
  for (const fee of toolInput.flat_fees) {
    const parsedFee = parsePrintedPriceToPiastres(fee.amount_egp_text);
    if (parsedFee === null) {
      return null;
    }
    flatFeesPiastres += parsedFee;
  }

  return taxBasePiastres + taxPiastres + flatFeesPiastres;
}

type GateDecision =
  | { accept: true; minConfidence: number; reconciledTotalPiastres: number; printedTotalPiastres: number }
  | { accept: false; reason: string; minConfidence?: number; reconciledTotalPiastres?: number; printedTotalPiastres?: number };

// Catches the failure mode the numeric reconciliation check is structurally
// blind to: a printed "Tax"/"VAT"/"GST" line with a percentage gets
// misfiled as a flat_fees entry instead of tax_line. The total still
// reconciles either way (a flat "VAT: 198.51" and a proportional 14% tax
// happened to sum to the same number on the receipt that surfaced this,
// 2026-08-02/03), so it slips past the confidence and reconciliation
// checks — a prompt hint alone didn't fix it (Gemini 3.1 Flash-Lite kept
// doing it anyway), so this rejects on the name pattern itself rather than
// trusting the model to self-correct.
//
// Deliberately does NOT match "service" — unlike tax/VAT/GST (which in
// Egypt is essentially always a percentage-based government tax), a
// "Service fee" is routinely a genuinely flat delivery-app charge with no
// percentage anywhere on the receipt (confirmed on the discount-receipt
// test case's real "Service fee: 15.75" line, which is correctly flat, not
// a misread service_line) — matching "service" here would reject that
// correct result as a false positive.
const SUSPICIOUS_FLAT_FEE_NAME_PATTERN = /\b(tax|vat|gst)\b/i;

function hasSuspiciousFlatFee(flatFees: GeminiExtractToolInput['flat_fees']): boolean {
  return flatFees.some((fee) => SUSPICIOUS_FLAT_FEE_NAME_PATTERN.test(fee.name));
}

/**
 * The accept/reject gate (user spec, 2026-08-02): accept Gemini's result
 * only if every populated confidence field clears the threshold, the
 * extraction reconciles against Gemini's own printed total, and no
 * flat_fees entry looks like a misclassified tax line. No printed
 * total at all counts as a reconciliation failure — without it there's
 * nothing to verify against, so this errs conservative and falls back to
 * Sonnet rather than trusting an unverifiable result. Returns a full
 * decision record (not just a boolean) so the caller can log exactly why a
 * result was rejected — essential while the real accept rate is still
 * being measured (2026-08-02: pricing math only pays off if this is tuned
 * against real behavior, not guessed at).
 */
function evaluateGeminiResult(toolInput: GeminiExtractToolInput, items: ExtractedItem[]): GateDecision {
  if (items.length === 0) {
    return { accept: false, reason: 'no items' };
  }
  if (hasSuspiciousFlatFee(toolInput.flat_fees)) {
    return { accept: false, reason: 'flat_fees contains a likely misclassified tax line' };
  }
  if (toolInput.printed_total_text === null || toolInput.printed_total_confidence === null) {
    return { accept: false, reason: 'no printed total (nothing to reconcile against)' };
  }
  const printedTotalPiastres = parsePrintedPriceToPiastres(toolInput.printed_total_text);
  if (printedTotalPiastres === null) {
    return { accept: false, reason: 'unparseable printed total' };
  }

  const confidences: number[] = [...toolInput.items.map((item) => item.confidence), toolInput.printed_total_confidence];
  if (toolInput.tax_line) {
    confidences.push(toolInput.tax_line.confidence);
  }
  if (toolInput.service_line) {
    confidences.push(toolInput.service_line.confidence);
  }
  if (toolInput.discount_line) {
    confidences.push(toolInput.discount_line.confidence);
  }
  const minConfidence = Math.min(...confidences);

  const reconciledTotalPiastres = computeReconciledTotalPiastres(toolInput, items);
  if (reconciledTotalPiastres === null) {
    return { accept: false, reason: 'unparseable discount_line amount', minConfidence, printedTotalPiastres };
  }

  if (minConfidence < GEMINI_CONFIDENCE_THRESHOLD) {
    return { accept: false, reason: 'confidence below threshold', minConfidence, reconciledTotalPiastres, printedTotalPiastres };
  }
  if (Math.abs(reconciledTotalPiastres - printedTotalPiastres) > GEMINI_RECONCILE_TOLERANCE_PIASTRES) {
    return { accept: false, reason: 'reconciliation mismatch', minConfidence, reconciledTotalPiastres, printedTotalPiastres };
  }
  return { accept: true, minConfidence, reconciledTotalPiastres, printedTotalPiastres };
}

// Real per-token pricing (2026-08-03), used to log real cost per request
// into extraction_requests rather than an estimate. Sonnet's intro pricing
// ($2/$10 per MTok) expires 2026-08-31 and reverts to $3/$15 — sonnetPricing()
// below switches automatically so logged costs stay accurate after that date
// without needing another deploy.
const GEMINI_INPUT_COST_PER_TOKEN = 0.25 / 1_000_000;
const GEMINI_OUTPUT_COST_PER_TOKEN = 1.5 / 1_000_000;
const SONNET_INTRO_PRICING_CUTOFF = new Date('2026-08-31T23:59:59Z');
const SONNET_INPUT_COST_PER_TOKEN_INTRO = 2 / 1_000_000;
const SONNET_OUTPUT_COST_PER_TOKEN_INTRO = 10 / 1_000_000;
const SONNET_INPUT_COST_PER_TOKEN_STANDARD = 3 / 1_000_000;
const SONNET_OUTPUT_COST_PER_TOKEN_STANDARD = 15 / 1_000_000;

function sonnetCostPerToken(): { input: number; output: number } {
  return new Date() <= SONNET_INTRO_PRICING_CUTOFF
    ? { input: SONNET_INPUT_COST_PER_TOKEN_INTRO, output: SONNET_OUTPUT_COST_PER_TOKEN_INTRO }
    : { input: SONNET_INPUT_COST_PER_TOKEN_STANDARD, output: SONNET_OUTPUT_COST_PER_TOKEN_STANDARD };
}

function computeCostUsd(usage: TokenUsage, inputCostPerToken: number, outputCostPerToken: number): number {
  return usage.inputTokens * inputCostPerToken + usage.outputTokens * outputCostPerToken;
}

/**
 * Persists one row per extraction request to extraction_requests — the
 * dashboard's only data source, since Cloudflare's live tail logs are
 * ephemeral. Best-effort: a logging failure must never break extraction
 * itself, so insert errors are swallowed (logged, not thrown).
 */
async function recordExtractionRequest(
  env: Env,
  outcome: string,
  geminiUsage: TokenUsage | null,
  sonnetUsage: TokenUsage | null,
): Promise<void> {
  const geminiCostUsd = geminiUsage ? computeCostUsd(geminiUsage, GEMINI_INPUT_COST_PER_TOKEN, GEMINI_OUTPUT_COST_PER_TOKEN) : null;
  const sonnetPricing = sonnetCostPerToken();
  const sonnetCostUsd = sonnetUsage ? computeCostUsd(sonnetUsage, sonnetPricing.input, sonnetPricing.output) : null;
  const totalCostUsd = (geminiCostUsd ?? 0) + (sonnetCostUsd ?? 0);
  try {
    await env.DB.prepare(
      `INSERT INTO extraction_requests
       (outcome, gemini_input_tokens, gemini_output_tokens, gemini_cost_usd, sonnet_used, sonnet_input_tokens, sonnet_output_tokens, sonnet_cost_usd, total_cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        outcome,
        geminiUsage?.inputTokens ?? null,
        geminiUsage?.outputTokens ?? null,
        geminiCostUsd,
        sonnetUsage ? 1 : 0,
        sonnetUsage?.inputTokens ?? null,
        sonnetUsage?.outputTokens ?? null,
        sonnetCostUsd,
        totalCostUsd,
      )
      .run();
  } catch (error) {
    console.error('recordExtractionRequest: insert failed', error);
  }
}

/**
 * The public entry point (replaces direct calls to
 * extractReceiptViaVisionLLM): tries Gemini 3.1 Flash-Lite first when
 * GEMINI_API_KEY is configured, and only trusts its result if
 * evaluateGeminiResult accepts it. Any failure to get a usable, acceptable
 * Gemini result — missing key, network failure, malformed response, low
 * confidence, or a reconciliation mismatch — falls back to the unchanged,
 * always-trusted Sonnet path. Sonnet's own result is never gated; it's the
 * backstop. Every path (except the no-key-configured case, which isn't a
 * real gate decision) logs a row via recordExtractionRequest for the
 * dashboard.
 */
export async function extractReceipt(imagesBytes: ArrayBuffer[], env: Env): Promise<ExtractionResponse> {
  if (env.GEMINI_API_KEY) {
    const geminiResult = await extractReceiptViaGemini(imagesBytes, env.GEMINI_API_KEY);
    if (geminiResult) {
      const { toolInput: geminiToolInput, usage: geminiUsage } = geminiResult;
      const parsed = parseItems(geminiToolInput.items);
      const decision: GateDecision = parsed
        ? evaluateGeminiResult(geminiToolInput, parsed.items)
        : { accept: false, reason: 'unparseable item price or discount' };
      if (decision.accept) {
        console.log(
          `extractReceipt: accepted Gemini result (cheap path) — minConfidence=${decision.minConfidence} reconciledTotal=${decision.reconciledTotalPiastres} printedTotal=${decision.printedTotalPiastres}`,
        );
        await recordExtractionRequest(env, 'accepted', geminiUsage, null);
        return buildExtractionResponse(geminiToolInput, 'extractReceiptViaGemini');
      }
      console.log(
        `extractReceipt: Gemini result rejected (${decision.reason}) — minConfidence=${decision.minConfidence ?? 'n/a'} reconciledTotal=${decision.reconciledTotalPiastres ?? 'n/a'} printedTotal=${decision.printedTotalPiastres ?? 'n/a'} — falling back to Sonnet`,
      );
      const sonnet = await callSonnetForExtraction(imagesBytes, env.ANTHROPIC_API_KEY);
      await recordExtractionRequest(env, `rejected: ${decision.reason}`, geminiUsage, sonnet.usage);
      return sonnet.result;
    }
    console.log('extractReceipt: Gemini call failed — falling back to Sonnet');
    const sonnet = await callSonnetForExtraction(imagesBytes, env.ANTHROPIC_API_KEY);
    await recordExtractionRequest(env, 'gemini_call_failed', null, sonnet.usage);
    return sonnet.result;
  }
  // No Gemini key configured at all (e.g. local dev) — Sonnet-only mode,
  // not a real gate decision, so nothing meaningful to log.
  return extractReceiptViaVisionLLM(imagesBytes, env.ANTHROPIC_API_KEY);
}

function isTruncatedResponse(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { stop_reason?: unknown }).stop_reason === 'max_tokens'
  );
}

/**
 * Pulls the forced tool call's input out of the Messages API response and
 * validates its full shape. Returns null on any mismatch — the caller maps
 * that to a generic error rather than ever passing the raw vendor payload
 * through. `strict: true` on the tool definition already guarantees this
 * server-side, but this is the Worker's own defense-in-depth check rather
 * than trusting the cast alone.
 */
function extractToolInput(body: unknown): ExtractReceiptToolInput | null {
  if (typeof body !== 'object' || body === null || !('content' in body)) {
    return null;
  }
  const content = (body as { content: unknown }).content;
  if (!Array.isArray(content)) {
    return null;
  }
  const toolUseBlock = content.find(
    (block): block is { type: 'tool_use'; name: string; input: unknown } =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'tool_use' &&
      (block as { name?: unknown }).name === 'extract_receipt',
  );
  if (!toolUseBlock) {
    return null;
  }
  const input = toolUseBlock.input;
  if (!isValidToolInput(input)) {
    return null;
  }
  return input;
}

function isValidToolInput(input: unknown): input is ExtractReceiptToolInput {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  const candidate = input as Record<string, unknown>;
  if (!Array.isArray(candidate.items)) {
    return false;
  }
  const itemsValid = candidate.items.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { name?: unknown }).name === 'string' &&
      typeof (item as { price_egp_text?: unknown }).price_egp_text === 'string' &&
      isValidQuantity((item as { quantity?: unknown }).quantity) &&
      isValidDiscountPercent((item as { discount_percent?: unknown }).discount_percent) &&
      isValidNullableString((item as { discount_flat_egp_text?: unknown }).discount_flat_egp_text),
  );
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
  return (
    isValidRateLine(candidate.tax_line) &&
    isValidRateLine(candidate.service_line) &&
    isValidDiscountLine(candidate.discount_line) &&
    isValidNullableString(candidate.printed_total_text) &&
    typeof candidate.image_mismatch === 'boolean' &&
    isValidNullableString(candidate.image_mismatch_note)
  );
}

// No real receipt line has anywhere near this many units of one item — exists
// to catch a hallucinated quantity (e.g. a misread "10" that should have been
// "1.0") before it ever reaches the per-unit split math.
const MAX_ITEM_QUANTITY = 500;

function isValidQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_ITEM_QUANTITY;
}

function isValidDiscountPercent(value: unknown): value is number | null {
  if (value === null) {
    return true;
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isValidNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

// Mirrors the client's `MAX_PERCENT_RATE` (money.ts) — no real tax/service
// rate is anywhere near this; it exists to catch a hallucinated or misread
// rate (e.g. NaN, a negative value, or a 140 misread as a 14) before it ever
// reaches `calculateSplitTotals`, rather than trusting the vision-LLM's
// number directly (code review finding, Story 1.6 review).
const MAX_RATE_PERCENT = 100;

function isValidRateLine(value: unknown): value is { rate_percent: number } | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const ratePercent = (value as { rate_percent?: unknown }).rate_percent;
  return (
    typeof ratePercent === 'number' &&
    Number.isFinite(ratePercent) &&
    ratePercent >= 0 &&
    ratePercent <= MAX_RATE_PERCENT
  );
}

// A discount can be printed as either a flat amount or a percentage — unlike
// tax_line/service_line (always percentage), so this accepts a nullable
// string for the amount alongside a nullable rate, rather than reusing
// isValidRateLine.
function isValidDiscountLine(value: unknown): value is { amount_egp_text: string | null; rate_percent: number | null } | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const candidate = value as { amount_egp_text?: unknown; rate_percent?: unknown };
  if (!isValidNullableString(candidate.amount_egp_text)) {
    return false;
  }
  if (candidate.rate_percent === null) {
    return true;
  }
  return (
    typeof candidate.rate_percent === 'number' &&
    Number.isFinite(candidate.rate_percent) &&
    candidate.rate_percent >= 0 &&
    candidate.rate_percent <= MAX_RATE_PERCENT
  );
}

export type SupportedImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/**
 * Sniffs the real image format from its magic bytes rather than trusting a
 * declared type — the vision-LLM API validates the declared `media_type`
 * against the actual bytes and 400s on a mismatch ("the image appears to be
 * a image/png image"). The client is expected to always upload JPEG (camera
 * capture and the gallery-pick path both produce JPEG), but that's an
 * assumption about client behavior the Worker shouldn't take on faith for a
 * cross-service contract — a manual multipart upload, a future client
 * change, or a gallery pick that skips re-encoding would otherwise silently
 * break extraction with an opaque "returned 400" and no indication why
 * (found via a real repro: uploading a raw .PNG returned exactly this 400).
 * Falls back to JPEG when the bytes don't match a known signature, same as
 * the previous hardcoded behavior for the common real-world case.
 */
export function detectImageMediaType(buffer: ArrayBuffer): SupportedImageMediaType {
  const bytes = new Uint8Array(buffer);
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  // GIF: "GIF8" (87a or 89a)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  // JPEG (FF D8 FF) and anything unrecognized both fall back here.
  return 'image/jpeg';
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
