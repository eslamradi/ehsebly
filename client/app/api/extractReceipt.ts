import { EXTRACTION_ENDPOINT } from './extractionEndpoint';
import type { ExtractionResult } from './types';

type WorkerResponseBody =
  | {
      status: 'ok';
      items: Array<{ name: string; price_piastres: number; quantity: number }>;
      tax_line?: { rate_percent: number };
      service_line?: { rate_percent: number };
      discount_line?: { amount_piastres?: number; rate_percent?: number };
      flat_fees?: Array<{ name: string; amount_piastres: number }>;
      printed_total_piastres?: number;
      discount_note?: string;
      image_mismatch_note?: string;
    }
  | { status: 'no_items_found' }
  | { status: 'error'; message: string };

// Generous margin over the Worker's own 45s vision-LLM budget (extract.ts's
// VISION_LLM_TIMEOUT_MS), to also cover round-trip/cold-start latency to the
// Worker itself. Without this, a hung or unreachable Worker leaves the
// fronter stuck on the "Reading your receipt…" screen indefinitely (code
// review finding, Story 1.2) — and if this ever drops below the Worker's own
// budget, the client aborts and shows "Could not reach the extraction
// service" even when the Worker is still working and would have succeeded.
const CLIENT_TIMEOUT_MS = 60_000;

/**
 * Sends the confirmed receipt photo(s) to the backend extraction proxy and
 * returns one of the AD-4 shapes. Never throws — network failures and
 * timeouts are caught and mapped to the same {status: "error"} shape the
 * caller already handles (Story 1.2 AC #5).
 */
export async function extractReceipt(photoUris: string[]): Promise<ExtractionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const formData = new FormData();
    photoUris.forEach((uri, index) => {
      // React Native's FormData has a special file-upload extension: an
      // object shaped {uri, name, type} tells the native networking layer
      // to stream the file directly from that URI when building the
      // multipart body. This is NOT the same as appending a real `Blob` —
      // a Blob obtained via `fetch(uri).then(r => r.blob())` looked correct
      // client-side (right size, right type) but serialized as an empty
      // 0-byte part once it reached the Worker, a real RN FormData/Blob gap
      // found via the Worker's own request logs. The {uri, name, type} form
      // is React Native's documented, actually-working idiom for this.
      formData.append('images', {
        uri,
        name: `receipt-${index}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);
    });

    const workerResponse = await fetch(EXTRACTION_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!workerResponse.ok) {
      return {
        status: 'error',
        message: `Extraction request failed (${workerResponse.status}).`,
      };
    }

    const body = (await workerResponse.json()) as WorkerResponseBody;
    return toExtractionResult(body);
  } catch {
    return { status: 'error', message: 'Could not reach the extraction service.' };
  } finally {
    clearTimeout(timeout);
  }
}

/** Exported for scripts/verifyExtraction.ts — otherwise only used internally above. */
export function toExtractionResult(body: WorkerResponseBody): ExtractionResult {
  if (body.status === 'ok') {
    // A detected flat fee (delivery, service, preparation — see extract.ts's
    // flat_fees) becomes an ordinary `shared` item, the exact same shape the
    // fronter's own manual "Add item" on ExtractedItemsScreen produces —
    // split equally among everyone once people exist, editable/removable
    // like any other item, no separate code path needed for it.
    const flatFeeItems = (body.flat_fees ?? []).map((fee) => ({
      name: fee.name,
      pricePiastres: fee.amount_piastres,
      quantity: 1,
      shared: true,
    }));
    return {
      status: 'ok',
      items: [
        ...body.items.map((item) => ({
          name: item.name,
          pricePiastres: item.price_piastres,
          quantity: item.quantity,
        })),
        ...flatFeeItems,
      ],
      taxRatePercent: body.tax_line?.rate_percent,
      serviceRatePercent: body.service_line?.rate_percent,
      discountRatePercent: body.discount_line?.rate_percent,
      discountFlatPiastres: body.discount_line?.amount_piastres,
      printedTotalPiastres: body.printed_total_piastres,
      discountNote: body.discount_note,
      imageMismatchWarning: body.image_mismatch_note,
    };
  }
  return body;
}
