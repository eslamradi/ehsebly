import { Share } from 'react-native';
import { calculatePersonSubtotals, calculatePersonTotals, describePersonItems } from './assignment';
import { formatPiastresAsEGP } from './money';
import { calculateSplitTotals, calculateSubtotalPiastres } from './splitCalculation';
import type { ItemAssignments, Person, TaxServiceSettings } from './session';

export type ShareableSplit = {
  items: Array<{ name: string; pricePiastres: number; quantity: number }>;
  taxService: TaxServiceSettings;
  people: Person[];
  itemAssignments: ItemAssignments;
};

/**
 * Plain-text rendering of the final split, for relaying it through any
 * share target outside the app (WhatsApp, SMS, etc.) — same numbers as
 * SplitSummary's on-screen display, formatted as text instead of UI.
 */
export function buildShareText({ items, taxService, people, itemAssignments }: ShareableSplit): string {
  const subtotalPiastres = calculateSubtotalPiastres(items);
  const totals = calculateSplitTotals({ subtotalPiastres, ...taxService });
  const personSubtotals = calculatePersonSubtotals(items, itemAssignments, people.length);
  const personTotals = calculatePersonTotals(personSubtotals, totals);

  const lines = people.map((person, personIndex) => {
    const itemsDescription = describePersonItems(personIndex, items, itemAssignments);
    return `${person.name}: ${formatPiastresAsEGP(personTotals[personIndex])} EGP (${itemsDescription})`;
  });

  const discountLine = taxService.discountEnabled
    ? [`Discount: -${formatPiastresAsEGP(totals.discountPiastres)} EGP`]
    : [];
  const otherServiceLine = taxService.otherServiceEnabled
    ? [`Other service: ${formatPiastresAsEGP(totals.otherServicePiastres)} EGP`]
    : [];

  return [
    'Breakdown — ehsebly',
    ...lines,
    ...discountLine,
    ...otherServiceLine,
    `Total: ${formatPiastresAsEGP(totals.totalPiastres)} EGP`,
  ].join('\n');
}

/**
 * Opens the OS share sheet with the split as plain text — the fallback path
 * when sharing the rendered split-card image isn't possible (capture
 * failure, or `expo-sharing` unavailable on the platform). Best-effort by
 * design, same as saveSplitToHistory — the user cancelling the share sheet
 * rejects just like a real failure would, and neither should surface as an
 * error to the fronter.
 */
export async function shareSplitText(split: ShareableSplit): Promise<void> {
  try {
    await Share.share({ message: buildShareText(split) });
  } catch {
    // Cancelled share sheet or platform-level failure — nothing to recover.
  }
}
