import type { Translate } from '../domain/share';

/**
 * Composes a charge row's label with its rate, or marks it off:
 * "Service · 12%", "Tax (off)".
 *
 * Lives here because three screens render the same rows — the tax preview,
 * the review totals and the final summary card — and each had grown its own
 * inline concatenation with the punctuation baked in. They had already
 * drifted (`· 12%` on one, `(12%)` on another), and none of it could be
 * translated, which is how "Discount", "Service (off)" and "Tax (off)"
 * survived two passes of this work in English.
 */
export function chargeLabel(t: Translate, label: string, enabled: boolean, ratePercent: number | null): string {
  if (!enabled) {
    return t('summary.disabled', { label });
  }
  return ratePercent === null ? label : t('summary.withRate', { label, rate: ratePercent });
}
