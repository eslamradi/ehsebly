/**
 * Standalone verification for `calculateSplitTotals` (Story 1.4, FR-6 /
 * AD-3). Not a test suite — this project has no test framework installed
 * and Architecture explicitly defers CI/testing infrastructure for v1
 * (see ARCHITECTURE-SPINE.md#Deferred). This is a plain script a human
 * re-runs on demand against the real production function.
 *
 * Run with: `npx tsx client/scripts/verifySplitCalculation.ts` (from the
 * `client/` directory, or adjust the path). tsx is zero-install via npx —
 * no new package.json dependency needed.
 *
 * Plain `node client/scripts/verifySplitCalculation.ts` does NOT work
 * despite this environment's Node (v25.2.1) supporting native .ts
 * execution: this script's extensionless relative import
 * (`from '../app/domain/splitCalculation'`) follows the same "bundler"
 * module resolution convention (tsconfig `moduleResolution: "bundler"`,
 * inherited from Expo) as the rest of the app — Node's own ESM loader
 * requires an explicit file extension and can't resolve it. Adding a
 * `.ts` extension to the import to satisfy Node instead breaks `tsc
 * --noEmit` (`TS5097: An import path can only end with a '.ts' extension
 * when 'allowImportingTsExtensions' is enabled` — not enabled here, and
 * enabling it project-wide is out of this story's scope). tsx handles
 * this resolution correctly with no config changes.
 */
import { calculateSplitTotals } from '../app/domain/splitCalculation';

let checks = 0;
let failures = 0;

// Spread into any call whose other-service charge isn't the thing under test.
const OTHER_SERVICE_DISABLED = {
  otherServiceEnabled: false,
  otherServiceRatePercent: 0,
};

function assertEqual(label: string, actual: number, expected: number): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
}

// --- AC #2: PRD addendum worked reference cases -----------------------

function checkGreekClubCairo(): void {
  // subtotal=184.00 EGP, service_rate=12%, tax_rate=14%
  // expected: service=22.08, tax=28.85, total=234.93
  const result = calculateSplitTotals({
    subtotalPiastres: 18400,
    taxEnabled: true,
    taxRatePercent: 14,
    serviceEnabled: true,
    serviceRatePercent: 12,
    ...OTHER_SERVICE_DISABLED,
  });
  assertEqual('Greek Club Cairo: subtotal', result.subtotalPiastres, 18400);
  assertEqual('Greek Club Cairo: service', result.servicePiastres, 2208);
  assertEqual('Greek Club Cairo: tax', result.taxPiastres, 2885);
  assertEqual('Greek Club Cairo: total', result.totalPiastres, 23493);
}

function checkFrenchMenuReceipt(): void {
  // subtotal=1266.00 EGP, service_rate=12%, tax_rate=14%
  // expected: service=151.92, tax=198.51, total=1616.43
  const result = calculateSplitTotals({
    subtotalPiastres: 126600,
    taxEnabled: true,
    taxRatePercent: 14,
    serviceEnabled: true,
    serviceRatePercent: 12,
    ...OTHER_SERVICE_DISABLED,
  });
  assertEqual('French-menu receipt: subtotal', result.subtotalPiastres, 126600);
  assertEqual('French-menu receipt: service', result.servicePiastres, 15192);
  assertEqual('French-menu receipt: tax', result.taxPiastres, 19851);
  assertEqual('French-menu receipt: total', result.totalPiastres, 161643);
}

// --- AC #1: degenerate on/off cases -------------------------------------

function checkBothDisabled(): void {
  const result = calculateSplitTotals({
    subtotalPiastres: 10000,
    taxEnabled: false,
    taxRatePercent: 14,
    serviceEnabled: false,
    serviceRatePercent: 12,
    ...OTHER_SERVICE_DISABLED,
  });
  assertEqual('Both disabled: service', result.servicePiastres, 0);
  assertEqual('Both disabled: tax', result.taxPiastres, 0);
  assertEqual('Both disabled: total', result.totalPiastres, 10000);
}

function checkTaxOnlyComputesOnRawSubtotal(): void {
  // With service off, tax must apply to the raw subtotal (service
  // contributes 0 to the "service-inclusive" amount) — not skipped, and
  // not compounded against a nonexistent service charge.
  const result = calculateSplitTotals({
    subtotalPiastres: 10000,
    taxEnabled: true,
    taxRatePercent: 14,
    serviceEnabled: false,
    serviceRatePercent: 12,
    ...OTHER_SERVICE_DISABLED,
  });
  assertEqual('Tax-only: service', result.servicePiastres, 0);
  assertEqual('Tax-only: tax', result.taxPiastres, 1400);
  assertEqual('Tax-only: total', result.totalPiastres, 11400);
}

function checkServiceOnlyLeavesTaxZero(): void {
  const result = calculateSplitTotals({
    subtotalPiastres: 10000,
    taxEnabled: false,
    taxRatePercent: 14,
    serviceEnabled: true,
    serviceRatePercent: 12,
    ...OTHER_SERVICE_DISABLED,
  });
  assertEqual('Service-only: service', result.servicePiastres, 1200);
  assertEqual('Service-only: tax', result.taxPiastres, 0);
  assertEqual('Service-only: total', result.totalPiastres, 11200);
}

// --- AC #3: exhaustive float-vs-exact sweep -----------------------------
//
// Story 1.3's code review flagged that `calculateSplitTotals` multiplies
// using ordinary JS floating-point arithmetic ((subtotal * rate) / 100)
// rather than integer-only math, and deferred the question to this story:
// "revisit if Story 1.4's formal acceptance test ever catches a
// discrepancy." This sweep is that formal test.
//
// `calculateSplitTotals` has two independent float-multiply-then-round
// sites doing the identical `roundHalfUp((X * rate) / 100)` shape:
//   - service: X = subtotalPiastres
//   - tax:     X = subtotalPiastres + servicePiastres ("service-inclusive")
// Both are swept below against exact BigInt-based rational arithmetic (no
// floating point anywhere) — an earlier version of this script swept only
// the service leg and left the tax leg covered by just the two hardcoded
// worked examples below, which a code review correctly flagged as a real
// gap between the "AD-3 concern closed" claim and what was actually
// proven. Since floating-point rounding behavior for `roundHalfUp((X *
// rate) / 100)` depends only on the magnitude of X and rate (not on
// *which* leg produced X), the tax sweep below reuses the identical
// exact-comparison method with a domain wide enough to cover every
// service-inclusive subtotal the service sweep could ever hand it (see
// `MAX_TAX_INPUT_PIASTRES` below) — this is not a redundant re-check, it
// exercises the actual second call site in the source, which the
// service-only sweep never touched.
//
// `totalPiastres` itself needs no separate sweep: it's `subtotalPiastres +
// servicePiastres + taxPiastres`, a plain integer addition of three values
// each already independently proven exact by the two sweeps below — no
// further floating-point step is involved in producing it.

const MAX_SUBTOTAL_PIASTRES = 300_000; // up to 3,000 EGP — far beyond any plausible group-dinner bill
const MAX_TAX_INPUT_PIASTRES = 600_000; // covers subtotalPiastres + servicePiastres up to a 100% service rate on the max subtotal above
const RATE_STEP_HUNDREDTHS = 25; // 0.25% steps, expressed in hundredths of a percent
const MAX_RATE_HUNDREDTHS = 10_000; // 100.00%

function exactRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  // denominator is always positive here; numerator is always non-negative.
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * Sweeps `roundHalfUp((X * ratePercent) / 100)` for X in `[1, maxX]` and
 * every rate in `[0, 100]` at `RATE_STEP_HUNDREDTHS` steps, comparing the
 * real function's float-based result against exact BigInt arithmetic.
 * `computeFloatResult` isolates whichever leg (service or tax) is under
 * test by disabling the other charge, so only the one multiplication/
 * rounding step in question is exercised per call.
 */
function sweepRoundHalfUpFloatVsExact(
  label: string,
  maxX: number,
  computeFloatResult: (x: number, ratePercent: number) => number,
): void {
  let combinations = 0;
  let mismatches = 0;
  let firstMismatch: string | null = null;

  for (let x = 1; x <= maxX; x++) {
    for (let rateHundredths = 0; rateHundredths <= MAX_RATE_HUNDREDTHS; rateHundredths += RATE_STEP_HUNDREDTHS) {
      combinations++;
      const ratePercent = rateHundredths / 100;

      const floatResult = computeFloatResult(x, ratePercent);
      const exact = exactRoundHalfUp(BigInt(x) * BigInt(rateHundredths), 10_000n);

      if (BigInt(floatResult) !== exact) {
        mismatches++;
        if (!firstMismatch) {
          firstMismatch = `x=${x}, rate=${ratePercent}% -> float=${floatResult}, exact=${exact}`;
        }
      }
    }
  }

  checks++;
  if (mismatches > 0) {
    failures++;
    console.error(
      `FAIL: ${label} — ${mismatches} mismatch(es) out of ${combinations} combinations. First: ${firstMismatch}`,
    );
  } else {
    console.log(`${label}: 0 mismatches across ${combinations} combinations.`);
  }
}

function checkNoFloatingPointRoundingDiscrepancyForService(): void {
  sweepRoundHalfUpFloatVsExact(
    'Service floating-point rounding',
    MAX_SUBTOTAL_PIASTRES,
    (subtotal, ratePercent) =>
      calculateSplitTotals({
        subtotalPiastres: subtotal,
        taxEnabled: false,
        taxRatePercent: 0,
        serviceEnabled: true,
        serviceRatePercent: ratePercent,
        ...OTHER_SERVICE_DISABLED,
      }).servicePiastres,
  );
}

function checkNoFloatingPointRoundingDiscrepancyForTax(): void {
  // serviceEnabled: false makes serviceInclusiveSubtotal === subtotalPiastres,
  // so this exercises the tax call site's own multiplication in isolation
  // (splitCalculation.ts's `taxPiastres = roundHalfUp((serviceInclusiveSubtotal
  // * taxRatePercent) / 100)`), with `subtotal` here standing in for
  // whatever service-inclusive value that line receives in practice.
  sweepRoundHalfUpFloatVsExact(
    'Tax floating-point rounding',
    MAX_TAX_INPUT_PIASTRES,
    (subtotal, ratePercent) =>
      calculateSplitTotals({
        subtotalPiastres: subtotal,
        taxEnabled: true,
        taxRatePercent: ratePercent,
        serviceEnabled: false,
        serviceRatePercent: 0,
        ...OTHER_SERVICE_DISABLED,
      }).taxPiastres,
  );
}

// --- other service: folds into the same base tax applies to -------------

function checkOtherServiceFoldedIntoTaxBase(): void {
  // subtotal=100.00, service=12% (12.00), other service "delivery service
  // 10%" (10.00) — both computed off the raw subtotal, summed into the base
  // tax is computed on top of, exactly like a second Service charge.
  const result = calculateSplitTotals({
    subtotalPiastres: 10000,
    taxEnabled: true,
    taxRatePercent: 14,
    serviceEnabled: true,
    serviceRatePercent: 12,
    otherServiceEnabled: true,
    otherServiceRatePercent: 10,
  });
  assertEqual('Other service: service unaffected', result.servicePiastres, 1200);
  assertEqual('Other service: output', result.otherServicePiastres, 1000);
  // tax base = 10000 + 1200 + 1000 = 12200; tax = 14% of 12200 = 1708
  assertEqual('Other service: tax computed on subtotal+service+other', result.taxPiastres, 1708);
  assertEqual('Other service: total', result.totalPiastres, 13908);
}

function checkOtherServiceUserPreviewExample(): void {
  // The exact worked example shown to the user when this feature was
  // designed: subtotal=340.00, service=12% (40.80), other service=10%
  // (34.00), tax base=414.80, tax=14% of 414.80=58.072 -> rounds to 58.07,
  // total=472.87.
  const result = calculateSplitTotals({
    subtotalPiastres: 34000,
    taxEnabled: true,
    taxRatePercent: 14,
    serviceEnabled: true,
    serviceRatePercent: 12,
    otherServiceEnabled: true,
    otherServiceRatePercent: 10,
  });
  assertEqual('Preview example: service', result.servicePiastres, 4080);
  assertEqual('Preview example: other service', result.otherServicePiastres, 3400);
  assertEqual('Preview example: tax', result.taxPiastres, 5807);
  assertEqual('Preview example: total', result.totalPiastres, 47287);
}

function checkOtherServiceDisabledIgnoresRateField(): void {
  // Disabled must zero out the output regardless of what garbage sits in
  // the rate field — same "disabled contributes 0, not a skipped rate"
  // discipline tax/service already hold.
  const result = calculateSplitTotals({
    subtotalPiastres: 10000,
    taxEnabled: false,
    taxRatePercent: 14,
    serviceEnabled: false,
    serviceRatePercent: 12,
    otherServiceEnabled: false,
    otherServiceRatePercent: 50,
  });
  assertEqual('Disabled other service: output', result.otherServicePiastres, 0);
  assertEqual('Disabled other service: total', result.totalPiastres, 10000);
}

// --- run everything ------------------------------------------------------

checkGreekClubCairo();
checkFrenchMenuReceipt();
checkBothDisabled();
checkTaxOnlyComputesOnRawSubtotal();
checkServiceOnlyLeavesTaxZero();
checkNoFloatingPointRoundingDiscrepancyForService();
checkNoFloatingPointRoundingDiscrepancyForTax();
checkOtherServiceFoldedIntoTaxBase();
checkOtherServiceUserPreviewExample();
checkOtherServiceDisabledIgnoresRateField();

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${checks} checks passed.`);
  process.exit(0);
}
