/**
 * Reconciles the computed receipt total against the receipt's printed
 * total (FR-10, Architecture Structural Seed: `app/domain/` owns
 * "compounding calc, assignment, reconciliation" — this is the third
 * piece). Pure comparison only — never mutates either input or attempts
 * to auto-correct a mismatch (AC #4).
 */

export type ReconciliationResult =
  | { status: 'match' }
  | { status: 'mismatch'; diffPiastres: number }
  | { status: 'unknown' };

// Both PRD addendum worked examples (Greek Club Cairo, French-menu
// restaurant) matched their printed totals exactly once subtotal and
// rates were read correctly — this compares two already-rounded integers,
// not an accumulation of independent per-person roundings, so drift
// should be at most a couple of piastres from benign venue-side rounding
// quirks. [ASSUMPTION] No exact tolerance figure is specified anywhere in
// the PRD/architecture ("small rounding tolerance" is the only text) —
// adjust if real dinner-testing surfaces a venue where this is wrong.
export const RECONCILIATION_TOLERANCE_PIASTRES = 2;

/**
 * `computedTotalPiastres` is `calculateSplitTotals(...).totalPiastres` —
 * NOT a sum of per-person totals (those already carry their own,
 * separately-tolerated, rounding — see `calculatePersonTotals`). A
 * missing `printedTotalPiastres` (OCR never detected a legible total
 * line) yields `'unknown'`, never a false `'match'` or `'mismatch'`.
 */
export function reconcileWithPrintedTotal(
  computedTotalPiastres: number,
  printedTotalPiastres: number | undefined,
  tolerancePiastres: number,
): ReconciliationResult {
  if (printedTotalPiastres === undefined) {
    return { status: 'unknown' };
  }
  const diffPiastres = computedTotalPiastres - printedTotalPiastres;
  if (Math.abs(diffPiastres) <= tolerancePiastres) {
    return { status: 'match' };
  }
  return { status: 'mismatch', diffPiastres };
}
