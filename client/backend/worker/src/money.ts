/**
 * Deterministically parses a printed receipt price (as transcribed digits,
 * e.g. "45.50", "12", "1,266.00") into integer piastres (EGP x 100).
 *
 * The vision-LLM is asked to transcribe only — never to do the unit
 * conversion or any arithmetic itself (Story 1.2 code review, decision:
 * "revise the contract" — money conversion must be deterministic code, not
 * model arithmetic, since a silent model conversion error would directly
 * undermine SM-2's zero-mismatch success bar). Pure integer string
 * arithmetic throughout — no floating-point multiplication.
 *
 * Returns null for anything that isn't a plain non-negative decimal number
 * with at most 2 fractional digits, so the caller can reject a malformed
 * transcription rather than silently computing a wrong price.
 */
export function parsePrintedPriceToPiastres(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [wholePart, fractionalPart = ''] = cleaned.split('.');
  const centsText = fractionalPart.padEnd(2, '0');
  return Number.parseInt(wholePart, 10) * 100 + Number.parseInt(centsText, 10);
}

/**
 * Rounds a fractional piastre amount to the nearest whole piastre, half-up
 * — mirrors client/app/domain/money.ts's `roundHalfUp` (Architecture AD-3's
 * documented rounding rule). Duplicated rather than shared since the client
 * and Worker are independent projects with no shared package in this v1
 * layout (same rationale as `parsePrintedPriceToPiastres` above).
 */
export function roundHalfUp(piastres: number): number {
  return Math.floor(piastres + 0.5);
}
