/**
 * Standalone verification for `client/app/domain/assignment.ts` (Story
 * 1.5, FR-7 / FR-8, extended for uneven multi-quantity items). Same shape
 * and rationale as `verifySplitCalculation.ts` (Story 1.4) — no test
 * framework exists for this project yet (Architecture's v1 deferral), so
 * this is a plain, re-runnable script against the real production
 * functions.
 *
 * Run with: `npx tsx client/scripts/verifyAssignment.ts` — plain
 * `node` does not work here (see Story 1.4's Dev Agent Record for why:
 * this script's extensionless imports follow the project's
 * `moduleResolution: "bundler"` convention, which Node's own ESM loader
 * can't resolve without tsx's help).
 */
import {
  areAllItemsAssigned,
  calculatePersonSubtotals,
  calculatePersonTotals,
  describePersonItems,
  hasUnevenWeights,
  splitItemAmongWeights,
} from '../app/domain/assignment';
import { calculateSplitTotals } from '../app/domain/splitCalculation';
import { roundHalfUp } from '../app/domain/money';

let checks = 0;
let failures = 0;

const OTHER_SERVICE_DISABLED = {
  otherServiceEnabled: false,
  otherServiceRatePercent: 0,
};

const DISCOUNT_DISABLED = {
  discountEnabled: false,
  discountMode: 'flat' as const,
  discountRatePercent: 0,
  discountFlatPiastres: 0,
};

function assertEqual(label: string, actual: number, expected: number): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
}

function assertArrayEqual(label: string, actual: number[], expected: number[]): void {
  checks++;
  const matches = actual.length === expected.length && actual.every((v, i) => v === expected[i]);
  if (!matches) {
    failures++;
    console.error(`FAIL: ${label} — expected [${expected}], got [${actual}]`);
  }
}

function assertTextEqual(label: string, actual: string, expected: string): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.error(`FAIL: ${label} — expected "${expected}", got "${actual}"`);
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sumShares(shares: Record<number, number>): number {
  return sum(Object.values(shares));
}

// --- splitItemAmongWeights: exactness, no leaked/invented piastre -------

function checkSplitItemAmongWeights(): void {
  // Original Story 1.5 behavior this generalizes: ONE shared item (equal
  // weights) still splits the same way the old equal-split code did —
  // 100 piastres / 3 equal-weight people: base≈33.33 each, remainder=1 ->
  // first person (by index) gets the extra piastre.
  const equalShares = splitItemAmongWeights(100, { 0: 1, 1: 1, 2: 1 });
  assertEqual('equal-weight 100/3 person 0', equalShares[0], 34);
  assertEqual('equal-weight 100/3 person 1', equalShares[1], 33);
  assertEqual('equal-weight 100/3 person 2', equalShares[2], 33);
  assertEqual('equal-weight 100/3 sum', sumShares(equalShares), 100);

  // The actual scenario this feature exists for: 10 water bottles, 300
  // piastres total (30 each exactly), split UNEVENLY — 3/1/2/4 units
  // across four people, not an even four-way split.
  const waterShares = splitItemAmongWeights(300, { 0: 3, 1: 1, 2: 2, 3: 4 });
  assertEqual('10-waters person 0 (3 units)', waterShares[0], 90);
  assertEqual('10-waters person 1 (1 unit)', waterShares[1], 30);
  assertEqual('10-waters person 2 (2 units)', waterShares[2], 60);
  assertEqual('10-waters person 3 (4 units)', waterShares[3], 120);
  assertEqual('10-waters sum == price', sumShares(waterShares), 300);

  // Uneven-price, uneven-weight case: 101 piastres split 7:3 must still
  // sum exactly, with the larger-weight person getting any leftover
  // piastre (largest-remainder method).
  const unevenShares = splitItemAmongWeights(101, { 0: 7, 1: 3 });
  assertEqual('uneven 101 split 7:3 sum', sumShares(unevenShares), 101);
  assertEqual('uneven 101 split 7:3 person 0 (larger weight)', unevenShares[0], 71);
  assertEqual('uneven 101 split 7:3 person 1', unevenShares[1], 30);

  // Single person gets everything regardless of their weight's value.
  const soloShares = splitItemAmongWeights(50, { 0: 5 });
  assertEqual('solo weight share', soloShares[0], 50);

  // A zero/absent weight contributes nothing and isn't in the result.
  const withZeroWeight = splitItemAmongWeights(90, { 0: 3, 1: 0 });
  assertEqual('zero-weight person share', withZeroWeight[1] ?? 0, 0);
  assertEqual('zero-weight sum still exact', sumShares(withZeroWeight), 90);

  // No weights at all -> empty result, not an error.
  assertEqual('no weights result size', Object.keys(splitItemAmongWeights(50, {})).length, 0);
}

// --- calculatePersonSubtotals: shared items, non-assignees get nothing --

function checkPersonSubtotals(): void {
  // 3 items, 3 people. Item 0 (1000) solo to person 0. Item 1 (600) shared
  // evenly by people 1 and 2 (equal weights — the original shared-item
  // case). Item 2 (100) shared by all three (the exactness case above).
  const items = [{ pricePiastres: 1000 }, { pricePiastres: 600 }, { pricePiastres: 100 }];
  const itemAssignments: Record<number, Record<number, number>> = {
    0: { 0: 1 },
    1: { 1: 1, 2: 1 },
    2: { 0: 1, 1: 1, 2: 1 },
  };
  const subtotals = calculatePersonSubtotals(items, itemAssignments, 3);

  // person 0: 1000 (item 0) + 34 (item 2 share) = 1034
  // person 1: 300 (item 1 share) + 33 (item 2 share) = 333
  // person 2: 300 (item 1 share) + 33 (item 2 share) = 333
  assertArrayEqual('person subtotals', subtotals, [1034, 333, 333]);

  // The sum of person subtotals must equal the sum of item prices — no
  // piastre leaked or invented across the whole receipt, not just one item.
  const totalItemPrices = sum(items.map((item) => item.pricePiastres));
  assertEqual('sum(personSubtotals) == sum(item prices)', sum(subtotals), totalItemPrices);

  // A person assigned nothing gets 0, not undefined/NaN.
  const noAssignments: Record<number, Record<number, number>> = {};
  const emptySubtotals = calculatePersonSubtotals(items, noAssignments, 3);
  assertArrayEqual('unassigned-everyone subtotals', emptySubtotals, [0, 0, 0]);
}

// --- calculatePersonTotals: proportional tax/service share --------------

function checkPersonTotals(): void {
  // Reuse Story 1.4's Greek Club Cairo numbers: subtotal=18400,
  // service=2208, tax=2885, total=23493. Two people split the subtotal
  // exactly in half (9200 each) via a single shared item.
  const totals = calculateSplitTotals({
    subtotalPiastres: 18400,
    taxEnabled: true,
    taxRatePercent: 14,
    serviceEnabled: true,
    serviceRatePercent: 12,
    ...OTHER_SERVICE_DISABLED,
    ...DISCOUNT_DISABLED,
  });
  const personSubtotals = [9200, 9200];
  const personTotals = calculatePersonTotals(personSubtotals, totals);

  // Each person's proportional share is exactly half the subtotal
  // (9200/18400 = 0.5 precisely) — but tax=2885 is odd, so half of it
  // (1442.5) still needs round-half-up applied, same as the real
  // function does. Getting this "expected" value right means replicating
  // that rounding, not just dividing by 2.
  const expectedPerPerson = 9200 + roundHalfUp(totals.taxPiastres / 2) + roundHalfUp(totals.servicePiastres / 2);
  assertEqual('even-split person 0 total', personTotals[0], expectedPerPerson);
  assertEqual('even-split person 1 total', personTotals[1], expectedPerPerson);

  // Sum of person totals should be within a few piastres of the receipt
  // total (FR-8's own "rounding tolerance" — not asserting exact equality
  // here on purpose; see Dev Notes on why this story doesn't force it).
  const summedPersonTotals = sum(personTotals);
  const tolerancePiastres = 5;
  checks++;
  if (Math.abs(summedPersonTotals - totals.totalPiastres) > tolerancePiastres) {
    failures++;
    console.error(
      `FAIL: sum(personTotals)=${summedPersonTotals} vs receipt total=${totals.totalPiastres} exceeds ${tolerancePiastres}-piastre tolerance`,
    );
  }

  // Zero subtotal (degenerate: no items assigned to anyone) must not
  // divide by zero.
  const zeroTotals = calculateSplitTotals({
    subtotalPiastres: 0,
    taxEnabled: true,
    taxRatePercent: 14,
    serviceEnabled: true,
    serviceRatePercent: 12,
    ...OTHER_SERVICE_DISABLED,
    ...DISCOUNT_DISABLED,
  });
  assertArrayEqual('zero-subtotal person totals', calculatePersonTotals([0, 0], zeroTotals), [0, 0]);
}

// --- calculatePersonTotals: other service splits proportionally ---------

function checkPersonTotalsOtherServiceSplitsProportionally(): void {
  // 3 people with very uneven item subtotals (1000/0/0) — other service
  // follows item proportions, exactly like tax/service, since it's folded
  // into the same base. (A flat delivery-style charge isn't handled here
  // at all anymore — it's an ordinary shared item, already covered by
  // checkPersonSubtotals' shared-item cases above.)
  const totals = calculateSplitTotals({
    subtotalPiastres: 1000,
    ...DISCOUNT_DISABLED,
    taxEnabled: false,
    taxRatePercent: 0,
    serviceEnabled: false,
    serviceRatePercent: 0,
    otherServiceEnabled: true,
    otherServiceRatePercent: 10,
  });
  // otherServicePiastres = 100; person 0 ordered everything, so gets all of it.
  const personTotals = calculatePersonTotals([1000, 0, 0], totals);
  assertArrayEqual('other service: follows item proportions', personTotals, [1100, 0, 0]);
}

// --- areAllItemsAssigned --------------------------------------------------

function checkAreAllItemsAssigned(): void {
  checks++;
  if (!areAllItemsAssigned(3, { 0: { 0: 1 }, 1: { 1: 1 }, 2: { 0: 1, 1: 1 } })) {
    failures++;
    console.error('FAIL: expected all 3 items assigned to report true');
  }
  checks++;
  if (areAllItemsAssigned(3, { 0: { 0: 1 }, 2: { 1: 1 } })) {
    failures++;
    console.error('FAIL: expected item 1 missing an assignee to report false');
  }
  checks++;
  if (areAllItemsAssigned(3, { 0: { 0: 1 }, 1: {}, 2: { 1: 1 } })) {
    failures++;
    console.error('FAIL: expected item 1 with no assignees to report false');
  }
  checks++;
  if (areAllItemsAssigned(3, { 0: { 0: 1 }, 1: { 0: 0 }, 2: { 1: 1 } })) {
    failures++;
    console.error('FAIL: expected item 1 with only a zero-weight entry to report false');
  }
  checks++;
  if (areAllItemsAssigned(0, {})) {
    // Vacuously true — no items to check. Documented behavior, not a bug:
    // the screen itself must not let the fronter reach "0 items" (Story
    // 1.2 guarantees a successful extraction always has >= 1 item).
  } else {
    failures++;
    console.error('FAIL: expected zero items to vacuously report true');
  }
}

/**
 * `describePersonItems` must only print "×N" when the assignees' weights
 * genuinely differ. Equal weights mean the line was shared, and the raw weight
 * describes nothing real: two people on a "Water ×10" at weight 1 each pay for
 * five waters apiece, so the old unconditional suffix rendered that as
 * "Water ×1" — a summary line contradicting the amount charged (UX review,
 * 2026-08-07).
 */
function checkDescribePersonItems(): void {
  const water = [{ name: 'Water', quantity: 10 }];

  // Shared evenly at weight 1 each — the case that used to print "×1".
  const evenlyShared = { 0: { 0: 1, 1: 1 } };
  assertTextEqual('shared ×10, weight 1 — person 0', describePersonItems(0, water, evenlyShared), 'Water');
  assertTextEqual('shared ×10, weight 1 — person 1', describePersonItems(1, water, evenlyShared), 'Water');

  // Equal but larger weights are still "shared", not per-unit counts.
  assertTextEqual(
    'shared ×10, weight 3 each',
    describePersonItems(0, water, { 0: { 0: 3, 1: 3 } }),
    'Water',
  );

  // Genuinely uneven — here the number does describe a real split, so keep it.
  const uneven = { 0: { 0: 3, 1: 7 } };
  assertTextEqual('uneven ×10 — person 0', describePersonItems(0, water, uneven), 'Water ×3');
  assertTextEqual('uneven ×10 — person 1', describePersonItems(1, water, uneven), 'Water ×7');

  // A sole assignee has nothing to be uneven against.
  assertTextEqual('sole assignee on ×10', describePersonItems(0, water, { 0: { 0: 4 } }), 'Water');

  // Quantity-1 items never carry a count, whatever the weights.
  const koshary = [{ name: 'Koshary', quantity: 1 }];
  assertTextEqual('quantity-1 item', describePersonItems(0, koshary, { 0: { 0: 1, 1: 1 } }), 'Koshary');

  assertTextEqual('unassigned person', describePersonItems(1, water, { 0: { 0: 1 } }), 'No items assigned');

  // Multiple items join in receipt order, mixing shared and uneven lines.
  const mixed = [
    { name: 'Koshary', quantity: 1 },
    { name: 'Water', quantity: 10 },
  ];
  assertTextEqual(
    'mixed shared + uneven',
    describePersonItems(0, mixed, { 0: { 0: 1, 1: 1 }, 1: { 0: 2, 1: 8 } }),
    'Koshary, Water ×2',
  );
}

/** Backs the count badge on ItemAssignmentScreen's chips — same rule, same source. */
function checkHasUnevenWeights(): void {
  const cases: Array<[string, Record<number, number>, boolean]> = [
    ['empty', {}, false],
    ['single assignee', { 0: 5 }, false],
    ['equal weights', { 0: 2, 1: 2, 2: 2 }, false],
    ['uneven weights', { 0: 3, 1: 7 }, true],
    ['zero weights ignored', { 0: 2, 1: 0, 2: 2 }, false],
    ['zero ignored, rest uneven', { 0: 1, 1: 0, 2: 4 }, true],
  ];
  for (const [label, weights, expected] of cases) {
    checks++;
    if (hasUnevenWeights(weights) !== expected) {
      failures++;
      console.error(`FAIL: hasUnevenWeights ${label} — expected ${expected}`);
    }
  }
}

// --- run everything ------------------------------------------------------

checkSplitItemAmongWeights();
checkPersonSubtotals();
checkPersonTotals();
checkPersonTotalsOtherServiceSplitsProportionally();
checkAreAllItemsAssigned();
checkDescribePersonItems();
checkHasUnevenWeights();

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${checks} checks passed.`);
  process.exit(0);
}
