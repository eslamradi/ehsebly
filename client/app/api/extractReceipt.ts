import { Platform } from 'react-native';
import { EXTRACTION_ENDPOINT } from './extractionEndpoint';
import type { ExtractionResult } from './types';
import { toExtractionResult, type WorkerResponseBody } from './extractionResponse';

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
    await Promise.all(
      photoUris.map(async (uri, index) => {
        // React Native's FormData has a special file-upload extension: an
        // object shaped {uri, name, type} tells the native networking layer
        // to stream the file directly from that URI when building the
        // multipart body. This is NOT the same as appending a real `Blob` —
        // a Blob obtained via `fetch(uri).then(r => r.blob())` looked correct
        // client-side (right size, right type) but serialized as an empty
        // 0-byte part once it reached the Worker, a real RN FormData/Blob gap
        // found via the Worker's own request logs. The {uri, name, type} form
        // is React Native's documented, actually-working idiom for this — but
        // on web, `FormData` is the browser's real implementation, which has
        // no such extension: that same object serializes as an empty part
        // (Worker logs showed "image files: 0" for every web request). Web
        // needs an actual Blob instead, fetched from the picker's uri
        // (a blob: or data: URL there, always same-origin/local, so a plain
        // fetch works with no CORS concern).
        if (Platform.OS === 'web') {
          const blob = await (await fetch(uri)).blob();
          formData.append('images', blob, `receipt-${index}.jpg`);
        } else {
          formData.append('images', {
            uri,
            name: `receipt-${index}.jpg`,
            type: 'image/jpeg',
          } as unknown as Blob);
        }
      }),
    );

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
