/**
 * Money display/parse helpers. All money is stored as an integer number of
 * piastres (EGP x 100) per Architecture AD-3 — these are the only two
 * places that convert to/from the decimal EGP the fronter sees on-screen.
 */

export function formatPiastresAsEGP(piastres: number): string {
  return (piastres / 100).toFixed(2);
}

/**
 * Parses a fronter-typed EGP price into integer piastres. Returns null for
 * anything that isn't a plain non-negative decimal number with at most 2
 * fractional digits (rejects negative values and malformed input like
 * "12.34.56" rather than silently guessing at one). Pure integer string
 * arithmetic — no floating-point multiplication (same approach as the
 * Worker's `parsePrintedPriceToPiastres`, kept as a separate implementation
 * since the client and Worker are independent projects with no shared
 * package in this v1 layout).
 */
export function parseEGPToPiastres(value: string): number | null {
  const cleaned = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [wholePart, fractionalPart = ''] = cleaned.split('.');
  const centsText = fractionalPart.padEnd(2, '0');
  return Number.parseInt(wholePart, 10) * 100 + Number.parseInt(centsText, 10);
}

// No real tax/service rate is anywhere near this — it exists to catch a
// typo like "140" instead of "14", which would otherwise silently produce
// a total several times too large.
const MAX_PERCENT_RATE = 100;

/**
 * Parses a fronter-typed percentage rate (e.g. "14", "12.5"). Returns null
 * for anything that isn't a plain non-negative decimal number no greater
 * than `MAX_PERCENT_RATE` — same defensive approach as `parseEGPToPiastres`,
 * rejecting rather than guessing at malformed or implausible input.
 */
export function parsePercentInput(value: string): number | null {
  const cleaned = value.trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const parsed = Number.parseFloat(cleaned);
  return parsed <= MAX_PERCENT_RATE ? parsed : null;
}

/**
 * Rounds a fractional piastre amount to the nearest whole piastre,
 * half-up — Architecture AD-3's documented rounding rule, applied
 * "consistently everywhere money is divided." Unlike the identically-named
 * helper briefly added to the Worker in Story 1.2 (which rounded an
 * already-integer value and was removed as dead code), this one rounds the
 * real output of a rate multiplication/division — a true fractional-piastre
 * case.
 */
export function roundHalfUp(piastres: number): number {
  return Math.floor(piastres + 0.5);
}
