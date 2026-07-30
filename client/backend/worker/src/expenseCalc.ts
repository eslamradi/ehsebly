import { roundHalfUp } from './money';

/**
 * Mirrors client/app/domain/splitCalculation.ts's `calculateSplitTotals`
 * exactly (same AD-3 compounding formula: service computed on the raw
 * subtotal first, then tax on the service-inclusive amount) — duplicated
 * server-side so `submitExpenseRoute` can recompute and verify a group
 * expense's totals instead of trusting client-submitted arithmetic outright
 * (Story 2.4 code review finding, 2026-07-30: the group ledger previously
 * had zero server-side arithmetic validation). Keep in sync if the client
 * formula ever changes. Duplicated rather than shared since the client and
 * Worker are independent projects with no shared package in this v1 layout
 * (same rationale as `parsePrintedPriceToPiastres`/`roundHalfUp` in money.ts).
 */
export type ExpenseRates = {
  taxEnabled: boolean;
  taxRatePercent: number;
  serviceEnabled: boolean;
  serviceRatePercent: number;
  otherServiceEnabled: boolean;
  otherServiceRatePercent: number;
};

export type ExpenseTotals = {
  servicePiastres: number;
  otherServicePiastres: number;
  taxPiastres: number;
  totalPiastres: number;
};

export function calculateExpenseTotals(subtotalPiastres: number, rates: ExpenseRates): ExpenseTotals {
  const servicePiastres = rates.serviceEnabled ? roundHalfUp((subtotalPiastres * rates.serviceRatePercent) / 100) : 0;
  const otherServicePiastres = rates.otherServiceEnabled
    ? roundHalfUp((subtotalPiastres * rates.otherServiceRatePercent) / 100)
    : 0;
  const taxBasePiastres = subtotalPiastres + servicePiastres + otherServicePiastres;
  const taxPiastres = rates.taxEnabled ? roundHalfUp((taxBasePiastres * rates.taxRatePercent) / 100) : 0;
  const totalPiastres = taxBasePiastres + taxPiastres;
  return { servicePiastres, otherServicePiastres, taxPiastres, totalPiastres };
}

// Mirrors client/app/domain/reconciliation.ts's RECONCILIATION_TOLERANCE_PIASTRES
// — same "small rounding tolerance" rationale (two already-rounded integers
// being compared, not an accumulation of independent roundings).
export const EXPENSE_TOTALS_TOLERANCE_PIASTRES = 2;
