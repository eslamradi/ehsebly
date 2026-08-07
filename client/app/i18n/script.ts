/**
 * Script detection for *user-supplied* text — receipt item names, people's
 * names — as opposed to the app's own copy.
 *
 * UI copy can pick its typeface from the active locale, because we wrote it
 * and know what script it's in. Receipt data can't: an Egyptian receipt is
 * frequently Arabic-script whatever language the user reads the app in, and
 * the Latin faces (Manrope, Fraunces) carry no Arabic glyphs at all. Setting
 * «كشري» in Manrope falls back to the system font on iOS and commonly draws
 * tofu on Android. Franco is the worst case of all — those users deliberately
 * choose a Latin interface while reading Arabic receipts perfectly well.
 *
 * So the font for user data follows the *text*, not the locale.
 */

// Arabic (0600–06FF), Arabic Supplement (0750–077F), Arabic Extended-B and -A
// (0870–08FF), and the Presentation Forms blocks (FB50–FDFF, FE70–FEFF) that
// some OCR output and older systems still emit.
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࡰ-ࣿﭐ-﷿ﹰ-﻿]/;

/**
 * True if the string contains any Arabic-script character. Deliberately "any"
 * rather than "mostly": real receipt lines mix scripts in a single field —
 * "PZ هاواى", "PA لازانيا" both came back from production extractions — and
 * such a string must be set in a face covering both. IBM Plex Sans Arabic
 * covers Latin as well, so treating a mixed string as Arabic renders all of
 * it correctly, whereas treating it as Latin cannot.
 */
export function containsArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}
