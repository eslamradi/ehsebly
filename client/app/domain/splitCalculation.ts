import { roundHalfUp } from './money';

export type SplitCalculationInput = {
  subtotalPiastres: number;
  taxEnabled: boolean;
  taxRatePercent: number;
  serviceEnabled: boolean;
  serviceRatePercent: number;
  otherServiceEnabled: boolean;
  otherServiceRatePercent: number;
};

export type SplitCalculationResult = {
  subtotalPiastres: number;
  servicePiastres: number;
  /** A second service-style percentage (e.g. "delivery service 10%") — computed off the raw subtotal like Service, folded into the same base tax is computed on top of, proportional per-person. */
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
 */
export function calculateSplitTotals(input: SplitCalculationInput): SplitCalculationResult {
  const {
    subtotalPiastres,
    taxEnabled,
    taxRatePercent,
    serviceEnabled,
    serviceRatePercent,
    otherServiceEnabled,
    otherServiceRatePercent,
  } = input;

  const servicePiastres = serviceEnabled
    ? roundHalfUp((subtotalPiastres * serviceRatePercent) / 100)
    : 0;

  const otherServicePiastres = otherServiceEnabled
    ? roundHalfUp((subtotalPiastres * otherServiceRatePercent) / 100)
    : 0;

  const taxBasePiastres = subtotalPiastres + servicePiastres + otherServicePiastres;
  const taxPiastres = taxEnabled ? roundHalfUp((taxBasePiastres * taxRatePercent) / 100) : 0;

  const totalPiastres = taxBasePiastres + taxPiastres;

  return {
    subtotalPiastres,
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
 * manually configured on TaxServiceScreen.
 */
export function computeInitialTaxServiceSettings(detected: {
  taxRatePercent?: number;
  serviceRatePercent?: number;
}): TaxServiceSettings {
  return {
    taxEnabled: detected.taxRatePercent !== undefined,
    taxRatePercent: detected.taxRatePercent ?? DEFAULT_TAX_RATE_PERCENT,
    serviceEnabled: detected.serviceRatePercent !== undefined,
    serviceRatePercent: detected.serviceRatePercent ?? DEFAULT_SERVICE_RATE_PERCENT,
    otherServiceEnabled: false,
    otherServiceRatePercent: 0,
  };
}
