import { parsePrintedPriceToPiastres } from './money';
import type { ExtractedItem, ExtractionResponse, FlatFeeLine } from './types';

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
          },
          required: ['name', 'price_egp_text', 'quantity'],
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
      flat_fees: {
        type: 'array',
        description:
          'Any additional named charge lines that print a flat amount with no percentage — e.g. "Delivery fee", "Service fee", "Preparation fee" on a delivery-app order screen. Do not include a line already captured in tax_line or service_line. Skip a fee that\'s printed as exactly 0 only if you\'re unsure it was actually a real line — when in doubt, include it. Empty array if none.',
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
  items: Array<{ name: string; price_egp_text: string; quantity: number }>;
  tax_line: { rate_percent: number } | null;
  service_line: { rate_percent: number } | null;
  flat_fees: Array<{ name: string; amount_egp_text: string }>;
  printed_total_text: string | null;
  image_mismatch: boolean;
  image_mismatch_note: string | null;
};

/**
 * Calls the vision-LLM API with the receipt photo and returns one of the
 * three AD-4 shapes. Never throws — every failure path (timeout, non-2xx,
 * malformed response) is caught and mapped to {status: "error"}.
 */
export async function extractReceiptViaVisionLLM(
  imagesBytes: ArrayBuffer[],
  apiKey: string,
): Promise<ExtractionResponse> {
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
      ? `These ${imagesBytes.length} images may be multiple photos or screenshots of the SAME single restaurant receipt or delivery-app order — e.g. several photos of one long paper receipt, or multiple screenshots taken while scrolling through one order-summary screen. First check whether they actually do belong to the same single order (same restaurant/store, same order ID if visible, consistent totals). If they do belong together, merge every unique charged line item across all images into a single list, don't double-count a line that appears in more than one image due to overlapping screenshots, and extract any explicit tax/service percentage lines and any flat named fee lines. If they do NOT belong together (different merchants, different orders, unrelated items), set image_mismatch to true and briefly explain why in image_mismatch_note — but still extract every field as normal from whichever single image represents one complete, coherent order (prefer the one with more legible detail), exactly as if that were the only image provided. Never leave items/totals empty just because of a mismatch — only leave them empty if no image contains a legible order at all. Skip anything shown as removed/cancelled/refunded. Use the extract_receipt tool.`
      : 'This is a photo of a restaurant receipt, or a screenshot of a food/grocery delivery app\'s order-summary screen. Extract every charged line item (skipping anything shown as removed/cancelled/refunded), any explicit tax/service percentage lines, and any flat named fee lines (delivery fee, service fee, preparation fee, etc.) using the extract_receipt tool.';

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
    return { status: 'error', message: 'Could not reach the extraction service.' };
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();

  if (!response.ok) {
    // Log the actual response body, not just the status — the body carries
    // the real reason (e.g. Anthropic's `error.message`), which the status
    // code alone doesn't explain when this needs debugging later.
    console.error('extractReceiptViaVisionLLM: vision-LLM API returned', response.status, responseText);
    return { status: 'error', message: `Extraction service returned ${response.status}.` };
  }

  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch (error) {
    console.error('extractReceiptViaVisionLLM: response body was not valid JSON', error, responseText);
    return { status: 'error', message: 'Extraction service returned an unreadable response.' };
  }

  if (isTruncatedResponse(body)) {
    console.error('extractReceiptViaVisionLLM: response was truncated (stop_reason: max_tokens)');
    return {
      status: 'error',
      message: 'Extraction was truncated — the receipt may have too many items.',
    };
  }

  const toolInput = extractToolInput(body);
  if (!toolInput) {
    console.error('extractReceiptViaVisionLLM: tool call input did not match the expected shape');
    return { status: 'error', message: 'Extraction service response was malformed.' };
  }

  if (toolInput.items.length === 0) {
    return { status: 'no_items_found' };
  }

  const items: ExtractedItem[] = [];
  for (const item of toolInput.items) {
    const piastres = parsePrintedPriceToPiastres(item.price_egp_text);
    if (piastres === null) {
      // The model transcribed something that isn't a plain non-negative
      // decimal price — reject the whole extraction rather than guess at
      // a price. This is deterministic string parsing, not model
      // arithmetic (see money.ts), so any failure here is a genuine
      // transcription problem, not a conversion error.
      console.error('extractReceiptViaVisionLLM: unparseable price text', item.price_egp_text);
      return { status: 'error', message: 'Extraction service returned an unreadable price.' };
    }
    items.push({ name: item.name, price_piastres: piastres, quantity: item.quantity });
  }

  const result: ExtractionResponse = { status: 'ok', items };
  if (toolInput.tax_line) {
    result.tax_line = { rate_percent: toolInput.tax_line.rate_percent };
  }
  if (toolInput.service_line) {
    result.service_line = { rate_percent: toolInput.service_line.rate_percent };
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
        console.error('extractReceiptViaVisionLLM: unparseable flat fee amount, omitting', fee.amount_egp_text);
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
      console.error(
        'extractReceiptViaVisionLLM: unparseable printed total text, omitting from response',
        toolInput.printed_total_text,
      );
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
      isValidQuantity((item as { quantity?: unknown }).quantity),
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

type SupportedImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

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
function detectImageMediaType(buffer: ArrayBuffer): SupportedImageMediaType {
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
