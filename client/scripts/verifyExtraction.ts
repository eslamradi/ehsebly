/**
 * Standalone verification for `toExtractionResult` (client/app/api/
 * extractReceipt.ts) — specifically the flat-fee mapping added after a real
 * failure report: delivery-app order-summary screenshots (Talabat/InstaShop/
 * Zooba-style) print named flat fees ("Delivery fee", "Service fee",
 * "Preparation fee") with no percentage, which the extraction schema had no
 * field for before `flat_fees` was added to the Worker's tool — those
 * amounts were silently dropped. Same shape and rationale as
 * `verifySplitCalculation.ts` — no test framework exists for this project
 * yet, so this is a plain, re-runnable script against the real production
 * function.
 *
 * Run with: `npx tsx client/scripts/verifyExtraction.ts` (see
 * verifySplitCalculation.ts's header for why plain `node` doesn't work).
 */
import { toExtractionResult } from '../app/api/extractReceipt';
import { calculatePersonSubtotals, calculatePersonTotals } from '../app/domain/assignment';
import { calculateSplitTotals, calculateSubtotalPiastres } from '../app/domain/splitCalculation';

let checks = 0;
let failures = 0;

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const NO_RATES = { taxEnabled: false, taxRatePercent: 0, serviceEnabled: false, serviceRatePercent: 0 };
const NO_OTHER_SERVICE = { otherServiceEnabled: false, otherServiceRatePercent: 0 };
const NO_DISCOUNT = {
  discountEnabled: false,
  discountMode: 'flat' as const,
  discountRatePercent: 0,
  discountFlatPiastres: 0,
};

// --- real-world case: IMG_8402, a Zooba order via a delivery app --------
// Order summary screenshot with no tax/service percentage anywhere — just a
// subtotal, a flat "Delivery" line (30 EGP), a flat "Service fee" line
// (5 EGP), and a grand total. Before flat_fees existed, both fee amounts
// were unrepresentable in the schema and vanished from the split entirely.

function checkZoobaDeliveryReceipt(): void {
  const result = toExtractionResult({
    status: 'ok',
    items: [
      { name: 'Koshari', price_piastres: 10498, quantity: 1 },
      { name: 'Rice Pudding', price_piastres: 5928, quantity: 1 },
      { name: 'Baladi Salad', price_piastres: 4589, quantity: 1 },
    ],
    flat_fees: [
      { name: 'Delivery', amount_piastres: 3000 },
      { name: 'Service fee', amount_piastres: 500 },
    ],
    printed_total_piastres: 24515,
  });

  if (result.status !== 'ok') {
    checks++;
    failures++;
    console.error(`FAIL: Zooba receipt: expected status 'ok', got '${result.status}'`);
    return;
  }

  assertEqual('Zooba receipt: item count (3 items + 2 flat fees)', result.items.length, 5);
  assertEqual('Zooba receipt: delivery fee name', result.items[3]?.name, 'Delivery');
  assertEqual('Zooba receipt: delivery fee price', result.items[3]?.pricePiastres, 3000);
  assertEqual('Zooba receipt: delivery fee quantity', result.items[3]?.quantity, 1);
  assertEqual('Zooba receipt: delivery fee is shared', result.items[3]?.shared, true);
  assertEqual('Zooba receipt: service fee name', result.items[4]?.name, 'Service fee');
  assertEqual('Zooba receipt: service fee price', result.items[4]?.pricePiastres, 500);
  assertEqual('Zooba receipt: service fee is shared', result.items[4]?.shared, true);
  // An OCR'd item (not hand-added) must never come back flagged shared —
  // only the fronter's own "Add item" or a detected flat fee sets it.
  assertEqual('Zooba receipt: OCR item is not shared', result.items[0]?.shared, undefined);

  // Reconciles exactly against the printed grand total (245.15 EGP) once
  // every item — food and both flat fees alike — is summed as an ordinary
  // subtotal, with no tax/service/other-service charges (none were printed).
  const subtotalPiastres = calculateSubtotalPiastres(result.items);
  const totals = calculateSplitTotals({ subtotalPiastres, ...NO_RATES, ...NO_OTHER_SERVICE, ...NO_DISCOUNT });
  assertEqual('Zooba receipt: total reconciles against printed total', totals.totalPiastres, 24515);

  // Simulates ItemAssignmentScreen's auto-check: both flat fees split
  // equally between two people, same as any other shared item, while the
  // food items stay wherever the fronter actually assigned them (here: all
  // to person 0, to prove the fee split doesn't follow food proportions).
  const itemAssignments: Record<number, Record<number, number>> = {
    0: { 0: 1 },
    1: { 0: 1 },
    2: { 0: 1 },
    3: { 0: 1, 1: 1 },
    4: { 0: 1, 1: 1 },
  };
  const personSubtotals = calculatePersonSubtotals(result.items, itemAssignments, 2);
  const personTotals = calculatePersonTotals(personSubtotals, totals);
  assertEqual(
    'Zooba receipt: sum(personTotals) == total (no piastre lost across the flat-fee items)',
    personTotals[0] + personTotals[1],
    totals.totalPiastres,
  );
  // person 0 gets all food (210.15 EGP = 21015) + half of both fees (1750);
  // person 1 gets nothing but half of both fees (1750).
  assertEqual('Zooba receipt: person 0 total', personTotals[0], 21015 + 1750);
  assertEqual('Zooba receipt: person 1 total', personTotals[1], 1750);
}

// --- no flat fees: field is entirely absent from the Worker response ----

function checkNoFlatFeesFieldOmitted(): void {
  const result = toExtractionResult({
    status: 'ok',
    items: [{ name: 'Koshary', price_piastres: 15000, quantity: 1 }],
  });
  if (result.status !== 'ok') {
    checks++;
    failures++;
    console.error(`FAIL: no-flat-fees case: expected status 'ok', got '${result.status}'`);
    return;
  }
  assertEqual('No flat fees: item count unchanged', result.items.length, 1);
  assertEqual('No flat fees: OCR item not shared', result.items[0]?.shared, undefined);
}

// --- image mismatch: two unrelated receipts submitted as one batch ------
// Empirically tested against the real Worker prompt+schema with IMG_8402
// (a Zooba order) and IMG_8403 (an unrelated grocery order) submitted
// together — the model correctly flagged the mismatch, still extracted a
// full valid receipt from the more legible image, and the note text below
// is the actual note it returned.

function checkImageMismatchWarningMapped(): void {
  const result = toExtractionResult({
    status: 'ok',
    items: [
      { name: 'Fresh Beef Shank', price_piastres: 27248, quantity: 1 },
      { name: 'Halo Baked Green Peas Chips Sea Salt Flavor', price_piastres: 1995, quantity: 1 },
      { name: "Cook's Pink Himalayan Rock Salt", price_piastres: 1495, quantity: 1 },
    ],
    flat_fees: [
      { name: 'Service fee', amount_piastres: 2000 },
      { name: 'Preparation fee', amount_piastres: 1811 },
    ],
    printed_total_piastres: 42109,
    image_mismatch_note:
      'First image is a Zooba restaurant delivery order (Koshari, Rice Pudding, Baladi Salad, total EGP 245.15) while second image is a grocery order (meat, snacks, salt, total EGP 421.09) with removed items - these are clearly two unrelated orders from different merchants.',
  });
  if (result.status !== 'ok') {
    checks++;
    failures++;
    console.error(`FAIL: image mismatch case: expected status 'ok', got '${result.status}'`);
    return;
  }
  assertEqual('Image mismatch: warning mapped onto the result', result.imageMismatchWarning?.includes('Zooba'), true);
  // The extraction itself is unaffected by the mismatch flag — the fronter
  // still gets a full, usable split for whichever order was extracted.
  assertEqual('Image mismatch: items still extracted', result.items.length, 5);
}

function checkNoImageMismatchFieldOmitted(): void {
  const result = toExtractionResult({
    status: 'ok',
    items: [{ name: 'Koshary', price_piastres: 15000, quantity: 1 }],
  });
  if (result.status !== 'ok') {
    checks++;
    failures++;
    console.error(`FAIL: no-mismatch case: expected status 'ok', got '${result.status}'`);
    return;
  }
  assertEqual('No mismatch: warning stays undefined', result.imageMismatchWarning, undefined);
}

// --- non-'ok' statuses pass through unchanged ----------------------------

function checkNonOkStatusPassesThrough(): void {
  assertEqual(
    'no_items_found passes through',
    toExtractionResult({ status: 'no_items_found' }).status,
    'no_items_found',
  );
  const errorResult = toExtractionResult({ status: 'error', message: 'boom' });
  assertEqual('error status passes through', errorResult.status, 'error');
  assertEqual(
    'error message passes through',
    errorResult.status === 'error' ? errorResult.message : undefined,
    'boom',
  );
}

// --- run everything ------------------------------------------------------

checkZoobaDeliveryReceipt();
checkNoFlatFeesFieldOmitted();
checkImageMismatchWarningMapped();
checkNoImageMismatchFieldOmitted();
checkNonOkStatusPassesThrough();

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${checks} checks passed.`);
  process.exit(0);
}
