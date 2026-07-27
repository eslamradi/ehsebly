/**
 * Standalone verification for `client/app/domain/reconciliation.ts`
 * (Story 1.6, FR-10). Same shape and rationale as
 * `verifySplitCalculation.ts` (Story 1.4) / `verifyAssignment.ts` (Story
 * 1.5) — no test framework exists for this project yet (Architecture's
 * v1 deferral), so this is a plain, re-runnable script against the real
 * production function.
 *
 * Run with: `npx tsx client/scripts/verifyReconciliation.ts` — plain
 * `node` does not work here (see Story 1.4's Dev Agent Record for why).
 */
import {
  RECONCILIATION_TOLERANCE_PIASTRES,
  reconcileWithPrintedTotal,
  type ReconciliationResult,
} from '../app/domain/reconciliation';

let checks = 0;
let failures = 0;

function assertStatus(label: string, actual: ReconciliationResult, expectedStatus: ReconciliationResult['status']): void {
  checks++;
  if (actual.status !== expectedStatus) {
    failures++;
    console.error(`FAIL: ${label} — expected status "${expectedStatus}", got "${actual.status}"`);
  }
}

function assertDiff(label: string, actual: ReconciliationResult, expectedDiff: number): void {
  checks++;
  if (actual.status !== 'mismatch') {
    failures++;
    console.error(`FAIL: ${label} — expected a mismatch result to check diffPiastres against, got "${actual.status}"`);
    return;
  }
  if (actual.diffPiastres !== expectedDiff) {
    failures++;
    console.error(`FAIL: ${label} — expected diffPiastres ${expectedDiff}, got ${actual.diffPiastres}`);
  }
}

// --- exact matches, from the PRD addendum's own worked examples ---------

function checkExactMatches(): void {
  // Greek Club Cairo: computed total=23493, printed total=23493.
  assertStatus(
    'Greek Club Cairo exact match',
    reconcileWithPrintedTotal(23493, 23493, RECONCILIATION_TOLERANCE_PIASTRES),
    'match',
  );

  // French-menu restaurant: computed total=161643, printed total=161643.
  assertStatus(
    'French-menu exact match',
    reconcileWithPrintedTotal(161643, 161643, RECONCILIATION_TOLERANCE_PIASTRES),
    'match',
  );
}

// --- within-tolerance and outside-tolerance boundary ---------------------

function checkTolerance(): void {
  assertStatus(
    'off by 1 piastre, within tolerance',
    reconcileWithPrintedTotal(23494, 23493, RECONCILIATION_TOLERANCE_PIASTRES),
    'match',
  );
  assertStatus(
    'off by 2 piastres, exactly at tolerance boundary',
    reconcileWithPrintedTotal(23491, 23493, RECONCILIATION_TOLERANCE_PIASTRES),
    'match',
  );
  const overResult = reconcileWithPrintedTotal(23496, 23493, RECONCILIATION_TOLERANCE_PIASTRES);
  assertStatus('off by 3 piastres, outside tolerance', overResult, 'mismatch');
  assertDiff('off by 3 piastres, signed diff', overResult, 3);

  // Negative direction: computed total is lower than printed (venue's own
  // total is higher than ours) — diff should be negative, not absolute.
  const underResult = reconcileWithPrintedTotal(23490, 23493, RECONCILIATION_TOLERANCE_PIASTRES);
  assertStatus('computed lower than printed by 3, outside tolerance', underResult, 'mismatch');
  assertDiff('computed lower than printed, signed diff is negative', underResult, -3);
}

// --- no printed total detected --------------------------------------------

function checkUnknown(): void {
  assertStatus(
    'no printed total detected',
    reconcileWithPrintedTotal(23493, undefined, RECONCILIATION_TOLERANCE_PIASTRES),
    'unknown',
  );
}

// --- degenerate and large-value cases (code review, Story 1.6) ----------

function checkDegenerateAndLargeValues(): void {
  // A zero-item receipt reduced to a zero subtotal, with a printed total
  // that's also legibly zero, is still a "match" — zero is a real value,
  // not a stand-in for "missing" (that's what `undefined` is for).
  assertStatus('zero computed vs zero printed', reconcileWithPrintedTotal(0, 0, RECONCILIATION_TOLERANCE_PIASTRES), 'match');

  // A large receipt (e.g. a big group dinner well into the thousands of
  // EGP) exercises the same comparison at a much bigger magnitude — the
  // function does plain integer arithmetic throughout, so this is mostly
  // a sanity check that nothing about the comparison degrades at scale.
  assertStatus(
    'large values, exact match',
    reconcileWithPrintedTotal(9_999_999, 9_999_999, RECONCILIATION_TOLERANCE_PIASTRES),
    'match',
  );
  const largeMismatch = reconcileWithPrintedTotal(9_999_999, 9_000_000, RECONCILIATION_TOLERANCE_PIASTRES);
  assertStatus('large values, outside tolerance', largeMismatch, 'mismatch');
  assertDiff('large values, signed diff', largeMismatch, 999_999);
}

// --- run everything ------------------------------------------------------

checkExactMatches();
checkTolerance();
checkUnknown();
checkDegenerateAndLargeValues();

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${checks} checks passed.`);
  process.exit(0);
}
