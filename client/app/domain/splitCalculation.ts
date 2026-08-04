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
  } = input;

  const discountPiastres = discountEnabled
    ? discountMode === 'flat'
      ? Math.min(discountFlatPiastres, subtotalPiastres)
      : roundHalfUp((subtotalPiastres * discountRatePercent) / 100)
    : 0;

  const discountedSubtotalPiastres = subtotalPiastres - discountPiastres;

  const servicePiastres = serviceEnabled
    ? roundHalfUp((discountedSubtotalPiastres * serviceRatePercent) / 100)
    : 0;

  const otherServicePiastres = otherServiceEnabled
    ? roundHalfUp((discountedSubtotalPiastres * otherServiceRatePercent) / 100)
    : 0;

  const taxBasePiastres = discountedSubtotalPiastres + servicePiastres + otherServicePiastres;
  const taxPiastres = taxEnabled ? roundHalfUp((taxBasePiastres * taxRatePercent) / 100) : 0;

  const totalPiastres = taxBasePiastres + taxPiastres;

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
export function computeInitialTaxServiceSettings(detected: {
  taxRatePercent?: number;
  serviceRatePercent?: number;
  discountFlatPiastres?: number;
  discountRatePercent?: number;
}): TaxServiceSettings {
  const discountMode: 'flat' | 'percent' = detected.discountFlatPiastres !== undefined ? 'flat' : 'percent';
  return {
    discountEnabled: detected.discountFlatPiastres !== undefined || detected.discountRatePercent !== undefined,
    discountMode,
    discountRatePercent: detected.discountRatePercent ?? 0,
    discountFlatPiastres: detected.discountFlatPiastres ?? 0,
    taxEnabled: detected.taxRatePercent !== undefined,
    taxRatePercent: detected.taxRatePercent ?? DEFAULT_TAX_RATE_PERCENT,
    serviceEnabled: detected.serviceRatePercent !== undefined,
    serviceRatePercent: detected.serviceRatePercent ?? DEFAULT_SERVICE_RATE_PERCENT,
    otherServiceEnabled: false,
    otherServiceRatePercent: 0,
  };
}
