/**
 * Guards the two tax conventions Egyptian receipts actually use.
 *
 * FALAK (recipts/IMG_8715.HEIC) prints VAT 14% = 63.00 and service 12% =
 * 54.00, both on a 450.00 subtotal, totalling 567.00. The app assumed tax
 * always compounds on service, computed 574.56, and overcharged the table by
 * 7.56. Neither convention is wrong, so the printed amount decides which one
 * this receipt used.
 *
 * Also covers a charge the receipt says is already inside the item prices,
 * and a breakdown saved before any of these fields existed.
 *
 * Run with: `npx tsx client/scripts/verifyTaxBasis.ts`
 */
import { calculateSplitTotals, calculateSubtotalPiastres, computeInitialTaxServiceSettings } from '../app/domain/splitCalculation';

let fail = 0;
const eq = (label: string, got: number, want: number) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: got ${(got / 100).toFixed(2)}, want ${(want / 100).toFixed(2)}`);
};

// FALAK, IMG_8715: VAT 14% and service 12% each charged on the raw subtotal.
const falakItems = [
  { name: 'Turkish Coffee - Single', pricePiastres: 13000, quantity: 2 },
  { name: 'Fajita', pricePiastres: 28000, quantity: 1 },
  { name: 'Water Bottle - Small', pricePiastres: 4000, quantity: 2 },
];
const falakSub = calculateSubtotalPiastres(falakItems);
const falak = computeInitialTaxServiceSettings({
  taxRatePercent: 14, serviceRatePercent: 12,
  taxAmountPiastres: 6300, subtotalPiastres: falakSub,
});
console.log(`  inferred basis: ${falak.taxBasis}`);
const falakTotals = calculateSplitTotals({ subtotalPiastres: falakSub, ...falak });
eq('FALAK subtotal', falakTotals.subtotalPiastres, 45000);
eq('FALAK service', falakTotals.servicePiastres, 5400);
eq('FALAK tax', falakTotals.taxPiastres, 6300);
eq('FALAK total matches printed 567.00', falakTotals.totalPiastres, 56700);

// A compounding receipt must still compound: 14% of (450 + 54) = 70.56.
const compounding = computeInitialTaxServiceSettings({
  taxRatePercent: 14, serviceRatePercent: 12,
  taxAmountPiastres: 7056, subtotalPiastres: 45000,
});
console.log(`  inferred basis: ${compounding.taxBasis}`);
const compTotals = calculateSplitTotals({ subtotalPiastres: 45000, ...compounding });
eq('compounded tax', compTotals.taxPiastres, 7056);
eq('compounded total', compTotals.totalPiastres, 57456);

// No printed amount: keep the old behaviour rather than guess.
const noAmount = computeInitialTaxServiceSettings({ taxRatePercent: 14, serviceRatePercent: 12 });
console.log(`  inferred basis: ${noAmount.taxBasis}`);
eq('no-amount total still compounds', calculateSplitTotals({ subtotalPiastres: 45000, ...noAmount }).totalPiastres, 57456);

// Tax already inside the item prices must not be added again.
const inclusive = computeInitialTaxServiceSettings({
  taxRatePercent: 14, subtotalPiastres: 45000, taxIncludedInPrices: true,
});
const incTotals = calculateSplitTotals({ subtotalPiastres: 45000, ...inclusive });
eq('inclusive tax adds nothing', incTotals.taxPiastres, 0);
eq('inclusive total is the subtotal', incTotals.totalPiastres, 45000);

// A saved breakdown from before any of this existed still computes.
const legacy = calculateSplitTotals({
  subtotalPiastres: 45000, discountEnabled: false, discountMode: 'percent',
  discountRatePercent: 0, discountFlatPiastres: 0, taxEnabled: true, taxRatePercent: 14,
  serviceEnabled: true, serviceRatePercent: 12, otherServiceEnabled: false, otherServiceRatePercent: 0,
});
eq('legacy entry unchanged', legacy.totalPiastres, 57456);

console.log(fail === 0 ? '\n  all basis checks passed' : `\n  ${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
