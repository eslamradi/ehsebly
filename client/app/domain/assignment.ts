import { roundHalfUp } from './money';
import type { SplitCalculationResult } from './splitCalculation';

/**
 * Splits an item's price proportionally by each assignee's weight — every
 * piastre of `pricePiastres` lands on exactly one person, none leaked or
 * invented. A weight is usually "how many units of this item they had"
 * (e.g. 10 waters: Alice=3, Bob=1, Carol=2, Dave=4), but weights never need
 * to sum to the item's quantity — equal weights (1 each) on a single shared
 * item reproduce the original "split evenly among assignees" behavior
 * (Story 1.5 AC #2), so both cases are just this one function. Uses the
 * largest-remainder method: each person's exact fractional share is
 * floored, then any leftover piastres go one each to whoever's fractional
 * share was closest to rounding up, tie-broken by ascending person index —
 * so the returned map always sums to exactly `pricePiastres`.
 */
export function splitItemAmongWeights(
  pricePiastres: number,
  weights: Record<number, number>,
): Record<number, number> {
  const personIndices = Object.keys(weights)
    .map(Number)
    .filter((personIndex) => weights[personIndex] > 0);
  const totalWeight = personIndices.reduce((sum, personIndex) => sum + weights[personIndex], 0);
  if (totalWeight === 0) {
    return {};
  }

  const rawShares = personIndices.map((personIndex) => ({
    personIndex,
    raw: (pricePiastres * weights[personIndex]) / totalWeight,
  }));

  const shares: Record<number, number> = {};
  let allocated = 0;
  for (const { personIndex, raw } of rawShares) {
    const base = Math.floor(raw);
    shares[personIndex] = base;
    allocated += base;
  }

  let remainder = pricePiastres - allocated;
  const byRemainderDesc = rawShares
    .map(({ personIndex, raw }) => ({ personIndex, fraction: raw - Math.floor(raw) }))
    .sort((a, b) => b.fraction - a.fraction || a.personIndex - b.personIndex);

  for (let i = 0; i < byRemainderDesc.length && remainder > 0; i++) {
    shares[byRemainderDesc[i].personIndex] += 1;
    remainder -= 1;
  }

  return shares;
}

/**
 * Accumulates each person's subtotal (by person array index) from every
 * item they hold a nonzero weight in, via `splitItemAmongWeights`. The sum
 * of the returned array always equals the sum of every item's price, since
 * weighted splitting never leaks or invents a piastre.
 */
export function calculatePersonSubtotals(
  items: Array<{ pricePiastres: number }>,
  itemAssignments: Record<number, Record<number, number>>,
  peopleCount: number,
): number[] {
  const personSubtotals = new Array(peopleCount).fill(0) as number[];
  items.forEach((item, itemIndex) => {
    const weights = itemAssignments[itemIndex] ?? {};
    const shares = splitItemAmongWeights(item.pricePiastres, weights);
    for (const [personIndexText, share] of Object.entries(shares)) {
      personSubtotals[Number(personIndexText)] += share;
    }
  });
  return personSubtotals;
}

/**
 * Each person's total = their item subtotal, minus their proportional share
 * of a whole-order discount, plus their proportional share of tax, service,
 * and other service (all computed off the same item-subtotal base), based
 * only on what they were assigned (Story 1.5 AC #4 / FR-8). A flat delivery-style charge isn't handled here at all — it's
 * modeled as an ordinary shared item in `itemAssignments`, so it already
 * flows through `personSubtotal` via `calculatePersonSubtotals` like
 * anything else. Proportional shares are independently round-half-up per
 * person — FR-8's own consequence text explicitly allows "rounding
 * tolerance" on the sum, so no reconciliation/apportionment layer is
 * applied here to force an exact match; that's a different comparison
 * (against the *printed* total) that belongs to FR-10/Story 1.6.
 */
export function calculatePersonTotals(
  personSubtotals: number[],
  totals: SplitCalculationResult,
): number[] {
  return personSubtotals.map((personSubtotal) => {
    const proportionalShareOf = (chargePiastres: number) =>
      totals.subtotalPiastres === 0 ? 0 : roundHalfUp((chargePiastres * personSubtotal) / totals.subtotalPiastres);

    const discountShare = proportionalShareOf(totals.discountPiastres);
    const taxShare = proportionalShareOf(totals.taxPiastres);
    const serviceShare = proportionalShareOf(totals.servicePiastres);
    const otherServiceShare = proportionalShareOf(totals.otherServicePiastres);

    return personSubtotal - discountShare + taxShare + serviceShare + otherServiceShare;
  });
}

/**
 * "Koshary, Water ×3" — every item this person holds a nonzero weight in.
 *
 * A weight is only rendered as "×N" when the assignees' weights actually
 * differ from each other, because only then does N describe a real per-person
 * count. When every assignee carries the same weight the item was shared
 * evenly, and printing the raw weight actively misleads: two people splitting
 * "Water ×10" at weight 1 each pay for five waters apiece, so the old
 * unconditional `×${weight}` rendered that as "Water ×1" — a line item
 * claiming they had one water while being charged for five. Equal weights now
 * render as the bare item name, matching how ItemAssignmentScreen presents the
 * same state ("Shared evenly", no count badge on the chip).
 *
 * Shared between SplitSummary's on-screen display and the share-text builder —
 * both need the identical per-person item breakdown.
 */
export function describePersonItems(
  personIndex: number,
  items: Array<{ name: string; quantity: number }>,
  itemAssignments: Record<number, Record<number, number>>,
): string {
  const parts = items
    .map((item, itemIndex) => {
      const weights = itemAssignments[itemIndex] ?? {};
      const weight = weights[personIndex] ?? 0;
      if (weight <= 0) {
        return null;
      }
      if (item.quantity <= 1 || !hasUnevenWeights(weights)) {
        return item.name;
      }
      return `${item.name} ×${weight}`;
    })
    .filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : 'No items assigned';
}

/**
 * True when the item's assignees don't all carry the same weight — i.e. it was
 * divided unevenly rather than shared. Drives both the "×N" suffix above and
 * the count badge on ItemAssignmentScreen's chips, so the two always agree on
 * whether a per-person number is meaningful enough to show.
 */
export function hasUnevenWeights(weights: Record<number, number>): boolean {
  const active = Object.values(weights).filter((weight) => weight > 0);
  return active.some((weight) => weight !== active[0]);
}

/** True only if every item has at least one person with a nonzero weight (Story 1.5 AC #3). */
export function areAllItemsAssigned(
  itemCount: number,
  itemAssignments: Record<number, Record<number, number>>,
): boolean {
  for (let index = 0; index < itemCount; index++) {
    const weights = itemAssignments[index] ?? {};
    if (!Object.values(weights).some((weight) => weight > 0)) {
      return false;
    }
  }
  return true;
}
