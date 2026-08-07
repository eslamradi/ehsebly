import { Share } from 'react-native';
import { calculatePersonSubtotals, calculatePersonTotals, describePersonItems } from './assignment';
import { formatPiastresAsEGP } from './money';
import { calculateSplitTotals, calculateSubtotalPiastres } from './splitCalculation';
import type { ItemAssignments, Person, TaxServiceSettings } from './session';

/**
 * The translator, injected rather than pulled from a hook: this module is a
 * pure text builder with no React context available to it. The share text is
 * rendered in the *sender's* language — they're the one composing the
 * message, and the recipient may not even use the app.
 */
export type Translate = (path: string, values?: Record<string, string | number>) => string;

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
export function buildShareText(
  { items, taxService, people, itemAssignments }: ShareableSplit,
  t: Translate,
): string {
  const subtotalPiastres = calculateSubtotalPiastres(items);
  const totals = calculateSplitTotals({ subtotalPiastres, ...taxService });
  const personSubtotals = calculatePersonSubtotals(items, itemAssignments, people.length);
  const personTotals = calculatePersonTotals(personSubtotals, totals);

  const lines = people.map((person, personIndex) =>
    t('share.personLine', {
      name: person.name,
      amount: formatPiastresAsEGP(personTotals[personIndex]),
      items: describePersonItems(personIndex, items, itemAssignments),
    }),
  );

  const discountLine = taxService.discountEnabled
    ? [t('share.discountLine', { amount: formatPiastresAsEGP(totals.discountPiastres) })]
    : [];
  const otherServiceLine = taxService.otherServiceEnabled
    ? [t('share.otherServiceLine', { amount: formatPiastresAsEGP(totals.otherServicePiastres) })]
    : [];

  return [
    t('share.title'),
    ...lines,
    ...discountLine,
    ...otherServiceLine,
    t('share.totalLine', { amount: formatPiastresAsEGP(totals.totalPiastres) }),
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
export async function shareSplitText(split: ShareableSplit, t: Translate): Promise<void> {
  try {
    await Share.share({ message: buildShareText(split, t) });
  } catch {
    // Cancelled share sheet or platform-level failure — nothing to recover.
  }
}
