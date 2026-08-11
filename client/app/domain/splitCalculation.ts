import { roundHalfUp } from './money';

export type SplitCalculationInput = {
  subtotalPiastres: number;
  discountEnabled: boolean;
  /** Which of the two discount value fields below is the active one. */
  discountMode: 'flat' | 'percent';
  discountRatePercent: number;
  discountFlatPiastres: number;
  taxEnabled: boolean;
  taxRatePercent: number;
  serviceEnabled: boolean;
  serviceRatePercent: number;
  otherServiceEnabled: boolean;
  otherServiceRatePercent: number;
  /**
   * What the tax percentage is charged on.
   *
   * Both conventions are real. FALAK (IMG_8715) prints VAT 14% and service
   * 12% each computed on the raw subtotal; other receipts charge tax on the
   * subtotal plus service. Assuming either one silently overcharges or
   * undercharges on the other, so the receipt decides — see
   * `computeInitialTaxServiceSettings`, which infers this from the amounts
   * the receipt actually printed.
   *
   * Kept as a basis rather than a fixed amount so that correcting a misread
   * item price still recomputes the charges correctly.
   */
  taxBasis?: 'subtotal' | 'subtotalPlusService';
  /**
   * True when the receipt says the charge is already inside the item prices
   * ("prices include VAT"). The line is then informational and must not be
   * added again.
   */
  taxIncludedInPrices?: boolean;
  serviceIncludedInPrices?: boolean;
};

export type SplitCalculationResult = {
  /** Raw item subtotal, before the discount — this is also the base `calculatePersonTotals` uses to proportion each person's discount/tax/service share, unchanged by whether a discount applies. */
  subtotalPiastres: number;
  /** A whole-order discount (delivery-app "Discount" line, or a receipt-wide coupon/promo) — reduces the subtotal before service/tax are computed on it. 0 when disabled. */
  discountPiastres: number;
  servicePiastres: number;
  /** A second service-style percentage (e.g. "delivery service 10%") — computed off the discounted subtotal like Service, folded into the same base tax is computed on top of, proportional per-person. */
  otherServicePiastres: number;
  taxPiastres: number;
  totalPiastres: number;
};

/**
 * The FR-6 compounding formula (Architecture AD-3, PRD addendum worked
 * reference): service is computed on the item subtotal first, then tax is
 * computed on the service-inclusive amount — never independently on the
 * raw subtotal. A disabled charge contributes 0, not a skipped rate.
 *
 * Other service (a second service-style percentage a receipt sometimes
 * prints separately from the main Service line — e.g. "delivery service
 * 10%") is computed off the raw item subtotal exactly like Service, and
 * folded into the same base tax is computed on top of. A flat charge with
 * no percentage on the receipt (a plain delivery fee) isn't this — that's
 * modeled as an ordinary item in the items list instead, split via
 * `itemAssignments` like anything else.
 *
 * Self-check (PRD addendum, Greek Club Cairo): subtotal=18400 piastres,
 * service_rate=12%, tax_rate=14% -> service=2208, tax=2885 (20608*14/100 =
 * 2885.12, rounds down under round-half-up), total=23493. Story 1.4 holds
 * this exact case as its own formal acceptance test — this function is
 * expected to already satisfy it, not the other way around (other service
 * disabled leaves its output at 0, so this case is unaffected).
 *
 * A whole-order discount (a delivery-app "Discount" line, or any
 * receipt-wide coupon/promo) reduces the subtotal FIRST, before service and
 * tax are computed on it — a discount changes what you're being charged
 * service/tax on, unlike a flat delivery-style fee (which is added as an
 * ordinary shared item instead and never touches this function at all).
 * Self-check (Al Reef Al Shami delivery order): subtotal=31500,
 * discount=4725 (flat) -> discounted base=26775, both tax and service off
 * on this receipt (its "Service fee"/"Delivery fee" are flat printed
 * amounts, not percentages — those are ordinary flat_fees items, not this
 * function's concern) -> total=26775, which nets to 283.50 EGP once
 * combined with the 15.75 EGP flat service-fee item, matching the printed
 * Total exactly.
 */
export function calculateSplitTotals(input: SplitCalculationInput): SplitCalculationResult {
  const {
    subtotalPiastres,
    discountEnabled,
    discountMode,
    discountRatePercent,
    discountFlatPiastres,
    taxEnabled,
    taxRatePercent,
    serviceEnabled,
    serviceRatePercent,
    otherServiceEnabled,
    otherServiceRatePercent,
    taxBasis = 'subtotalPlusService',
    taxIncludedInPrices = false,
    serviceIncludedInPrices = false,
  } = input;

  const discountPiastres = discountEnabled
    ? discountMode === 'flat'
      ? Math.min(discountFlatPiastres, subtotalPiastres)
      : roundHalfUp((subtotalPiastres * discountRatePercent) / 100)
    : 0;

  const discountedSubtotalPiastres = subtotalPiastres - discountPiastres;

  const servicePiastres =
    serviceEnabled && !serviceIncludedInPrices
      ? roundHalfUp((discountedSubtotalPiastres * serviceRatePercent) / 100)
      : 0;

  const otherServicePiastres = otherServiceEnabled
    ? roundHalfUp((discountedSubtotalPiastres * otherServiceRatePercent) / 100)
    : 0;

  // What tax is charged on, per the receipt's own convention.
  const taxBasePiastres =
    taxBasis === 'subtotal'
      ? discountedSubtotalPiastres
      : discountedSubtotalPiastres + servicePiastres + otherServicePiastres;
  const taxPiastres =
    taxEnabled && !taxIncludedInPrices ? roundHalfUp((taxBasePiastres * taxRatePercent) / 100) : 0;

  // Always the full stack, whatever tax happened to be charged on.
  const totalPiastres = discountedSubtotalPiastres + servicePiastres + otherServicePiastres + taxPiastres;

  return {
    subtotalPiastres,
    discountPiastres,
    servicePiastres,
    otherServicePiastres,
    taxPiastres,
    totalPiastres,
  };
}

/** Sums extracted items' prices into the receipt subtotal (integer piastres). */
export function calculateSubtotalPiastres(items: Array<{ pricePiastres: number }>): number {
  return items.reduce((sum, item) => sum + item.pricePiastres, 0);
}

export type TaxServiceSettings = {
  discountEnabled: boolean;
  discountMode: 'flat' | 'percent';
  discountRatePercent: number;
  discountFlatPiastres: number;
  taxEnabled: boolean;
  taxRatePercent: number;
  serviceEnabled: boolean;
  serviceRatePercent: number;
  otherServiceEnabled: boolean;
  otherServiceRatePercent: number;
  /** See SplitCalculationInput — what the tax percentage is charged on. */
  taxBasis?: 'subtotal' | 'subtotalPlusService';
  /** True when the receipt says the charge is already inside item prices. */
  taxIncludedInPrices?: boolean;
  serviceIncludedInPrices?: boolean;
};

const DEFAULT_TAX_RATE_PERCENT = 14;
const DEFAULT_SERVICE_RATE_PERCENT = 12;

/**
 * A charge defaults ON only if its line was actually detected during
 * extraction; otherwise it starts OFF with the standard fallback rate
 * pre-filled and ready if the fronter turns it on (PRD addendum — SEA SOUL
 * Restaurant finding, Story 1.3 AC #1). Other service has no extraction
 * detection at all (FR-2 doesn't look for it) — it always starts off,
 * manually configured on TaxServiceScreen. Discount defaults on only when
 * extraction actually found a whole-order discount line (a flat amount
 * takes priority over a percentage if somehow both were detected, since a
 * flat amount is the more literal transcription of what's printed).
 */
/**
 * Works out what the tax percentage was charged on, by checking the amount
 * the receipt printed against both conventions.
 *
 * FALAK (IMG_8715) prints subtotal 450.00, VAT 14% = 63.00, service 12% =
 * 54.00. 14% of the raw subtotal is 63.00, while 14% of subtotal-plus-service
 * is 70.56 — so that receipt charges tax on the subtotal, and the printed
 * amount is what says so. Receipts that compound give the opposite answer.
 *
 * Returns the previous default when there is nothing to go on: no printed
 * amount, or an amount that neither convention explains (a fixed cover charge
 * dressed as a percentage, or a misread digit).
 */
function inferTaxBasis(detected: {
  taxRatePercent?: number;
  serviceRatePercent?: number;
  taxAmountPiastres?: number;
  subtotalPiastres?: number;
}): 'subtotal' | 'subtotalPlusService' {
  const { taxRatePercent, serviceRatePercent, taxAmountPiastres, subtotalPiastres } = detected;
  if (taxRatePercent === undefined || taxAmountPiastres === undefined || subtotalPiastres === undefined) {
    return 'subtotalPlusService';
  }
  const onSubtotal = roundHalfUp((subtotalPiastres * taxRatePercent) / 100);
  const servicePiastres =
    serviceRatePercent === undefined ? 0 : roundHalfUp((subtotalPiastres * serviceRatePercent) / 100);
  const onSubtotalPlusService = roundHalfUp(((subtotalPiastres + servicePiastres) * taxRatePercent) / 100);

  // A piastre of slack for the receipt's own rounding.
  if (Math.abs(taxAmountPiastres - onSubtotal) <= 1) {
    return 'subtotal';
  }
  if (Math.abs(taxAmountPiastres - onSubtotalPlusService) <= 1) {
    return 'subtotalPlusService';
  }
  return 'subtotalPlusService';
}

/**
 * Works out a charge's rate when the receipt printed an amount but no
 * percentage, by dividing that amount by what it was charged on.
 *
 * Drinkies (IMG_5916) prints `Subtotal 3,114.04`, `VAT 435.96`, no percentage
 * anywhere. 435.96 / 3,114.04 is 13.9998%, so the rate is 14. Dividing by the
 * total instead gives 12.28%, which looks plausibly like a service rate and
 * is wrong — the base has to be the subtotal.
 *
 * Returns undefined rather than a guess when there is nothing to divide by,
 * or when the result is not close enough to a sensible rate to trust.
 */
function deriveRatePercent(amountPiastres?: number, basePiastres?: number): number | undefined {
  if (amountPiastres === undefined || !basePiastres) {
    return undefined;
  }
  const rate = (amountPiastres / basePiastres) * 100;
  if (rate <= 0 || rate > 100) {
    return undefined;
  }
  // Printed rates in Egypt are whole percents, and printed amounts are
  // rounded to the piastre, so a genuine rate lands very near a whole number.
  // Anything else means the amount was not simply that rate applied to this
  // base — Buffalo Burger's VAT covers its delivery fee too, and dividing it
  // by the subtotal yields 14.93%, which is not a rate anyone charges. Better
  // to report nothing than to show an invented one.
  const nearestWhole = Math.round(rate);
  return Math.abs(rate - nearestWhole) <= 0.1 ? nearestWhole : undefined;
}

/**
 * True when the item lines already contain the tax the receipt lists
 * separately.
 *
 * The test is rate-free, which matters because these receipts often print no
 * percentage: if the items exceed the printed subtotal by exactly the printed
 * tax, that tax is inside the item prices. Drinkies items sum to 3,550.00
 * against a subtotal of 3,114.04, a gap of 435.96 — precisely the VAT line.
 *
 * Buffalo Burger (ec846673) fails this deliberately: its gap is 94.55 while
 * its VAT is 100.86, because that VAT also covers the delivery fee. Not the
 * same number, so not a clean inclusive case, and it stays flagged.
 */
function taxLooksIncludedInPrices(detected: {
  taxAmountPiastres?: number;
  subtotalPiastres?: number;
  printedSubtotalPiastres?: number;
}): boolean {
  const { taxAmountPiastres, subtotalPiastres, printedSubtotalPiastres } = detected;
  if (taxAmountPiastres === undefined || subtotalPiastres === undefined || printedSubtotalPiastres === undefined) {
    return false;
  }
  const gap = subtotalPiastres - printedSubtotalPiastres;
  return gap > 0 && Math.abs(gap - taxAmountPiastres) <= 2;
}

export function computeInitialTaxServiceSettings(detected: {
  taxRatePercent?: number;
  serviceRatePercent?: number;
  discountFlatPiastres?: number;
  discountRatePercent?: number;
  taxAmountPiastres?: number;
  subtotalPiastres?: number;
  taxIncludedInPrices?: boolean;
  serviceIncludedInPrices?: boolean;
  printedSubtotalPiastres?: number;
}): TaxServiceSettings {
  // A receipt that prints an amount but no percentage still tells us its rate.
  const taxRatePercent =
    detected.taxRatePercent ??
    deriveRatePercent(detected.taxAmountPiastres, detected.printedSubtotalPiastres);
  const taxIncludedInPrices = detected.taxIncludedInPrices || taxLooksIncludedInPrices(detected);
  const discountMode: 'flat' | 'percent' = detected.discountFlatPiastres !== undefined ? 'flat' : 'percent';
  return {
    discountEnabled: detected.discountFlatPiastres !== undefined || detected.discountRatePercent !== undefined,
    discountMode,
    discountRatePercent: detected.discountRatePercent ?? 0,
    discountFlatPiastres: detected.discountFlatPiastres ?? 0,
    taxEnabled: taxRatePercent !== undefined,
    taxRatePercent: taxRatePercent ?? DEFAULT_TAX_RATE_PERCENT,
    serviceEnabled: detected.serviceRatePercent !== undefined,
    serviceRatePercent: detected.serviceRatePercent ?? DEFAULT_SERVICE_RATE_PERCENT,
    otherServiceEnabled: false,
    otherServiceRatePercent: 0,
    taxBasis: inferTaxBasis({ ...detected, taxRatePercent }),
    taxIncludedInPrices,
    serviceIncludedInPrices: detected.serviceIncludedInPrices ?? false,
  };
}
