import type { Translate } from '../domain/share';

/**
 * Maps a Worker error code (see `backend/worker/src/errors.ts`) onto a
 * localized string.
 *
 * The Worker used to return English prose, which quietly made the backend the
 * owner of a third of the app's error copy — untranslatable without teaching
 * it every language. It now sends a code alongside that prose, so the choice
 * of words happens here, where the locale is.
 *
 * Falls back to the Worker's own English `message` for any code this build
 * doesn't know, which is what keeps a newer Worker safe to deploy against an
 * older app: an unrecognised code degrades to English rather than to blank.
 */
const KEY_BY_CODE: Record<string, string> = {
  extractionUnreachable: 'errors.unreachable',
  extractionUnreadable: 'errors.unreadableResponse',
  extractionUpstreamError: 'errors.upstream',
  extractionTruncated: 'errors.truncated',
  extractionMalformed: 'errors.malformed',
  extractionUnreadablePrice: 'errors.unreadablePrice',
  extractionNotConfigured: 'errors.notConfigured',
  photoUnreadable: 'errors.unreadableImage',
  photoMissing: 'errors.noImage',
  tooManyPhotos: 'errors.tooManyImages',
};

export function errorMessageForCode(
  t: Translate,
  code: string | undefined,
  fallbackMessage: string,
  values?: Record<string, string | number>,
): string {
  const key = code ? KEY_BY_CODE[code] : undefined;
  return key ? t(key, values) : fallbackMessage;
}

/** Exported for the verification script, which checks every code has a key. */
export const LOCALIZED_ERROR_CODES = Object.keys(KEY_BY_CODE);
