import { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { calculatePersonSubtotals, calculatePersonTotals, describePersonItems } from '../domain/assignment';
import { formatPiastresAsEGP } from '../domain/money';
import { calculateSplitTotals, calculateSubtotalPiastres } from '../domain/splitCalculation';
import type { ItemAssignments, Person, TaxServiceSettings } from '../domain/session';
import type { Translate } from '../domain/share';
import { useI18n } from '../i18n';
import { chargeLabel } from '../i18n/chargeLabel';
import { fonts, radii, spacing, useTheme, type Theme, userTextStyle } from '../theme';

type SplitSummaryProps = {
  photoUris?: string[];
  items: Array<{ name: string; pricePiastres: number; quantity: number }>;
  taxService: TaxServiceSettings;
  people: Person[];
  itemAssignments: ItemAssignments;
};

const TORN_EDGE_NOTCHES = 14;

/**
 * The FR-11 final-split display, shared between the live FinalSplitScreen
 * (right after a session completes) and HistoryDetailScreen (reopening a
 * past one) — both render the exact same computed numbers from the exact
 * same inputs, so this stays the single place that math is turned into UI.
 */
export function SplitSummary({ photoUris = [], items, taxService, people, itemAssignments }: SplitSummaryProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const styles = useThemedStyles(theme);

  const subtotalPiastres = calculateSubtotalPiastres(items);
  const totals = calculateSplitTotals({ subtotalPiastres, ...taxService });
  const personSubtotals = calculatePersonSubtotals(items, itemAssignments, people.length);
  const personTotals = calculatePersonTotals(personSubtotals, totals);
  const contextNote = describeIncludedCharges(taxService, t);

  return (
    <>
      {photoUris.length === 1 ? (
        // The common case: one photo renders full-width, same as before
        // multi-photo support existed.
        <Image accessibilityLabel={t('summary.receiptPhoto')} source={{ uri: photoUris[0] }} style={styles.photo} />
      ) : photoUris.length > 1 ? (
        // Multiple photos (e.g. a long receipt shot in pieces, or several
        // scrolled screenshots of one delivery-app order) — a horizontal
        // strip of thumbnails instead of stacking full-width images.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStripContent}>
          {photoUris.map((uri, index) => (
            <Image
              key={uri}
              accessibilityLabel={t('summary.receiptPhotoIndexed', { index: index + 1, total: photoUris.length })}
              source={{ uri }}
              style={styles.photoThumb}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.receiptCard}>
        <View style={styles.receiptBody}>
          <ReceiptLine styles={styles} label={t('taxService.subtotal')} piastres={totals.subtotalPiastres} />
          <ReceiptLine
            styles={styles}
            label={chargeLabel(
              t,
              t('taxService.discount'),
              taxService.discountEnabled,
              // A flat discount has no rate to show, so it stays a bare label
              // rather than being marked "off" — it is very much on.
              taxService.discountMode === 'percent' ? taxService.discountRatePercent : null,
            )}
            piastres={-totals.discountPiastres}
          />
          <ReceiptLine
            styles={styles}
            label={chargeLabel(t, t('taxService.service'), taxService.serviceEnabled, taxService.serviceRatePercent)}
            piastres={totals.servicePiastres}
          />
          <ReceiptLine
            styles={styles}
            label={chargeLabel(
              t,
              t('taxService.otherService'),
              taxService.otherServiceEnabled,
              taxService.otherServiceRatePercent,
            )}
            piastres={totals.otherServicePiastres}
          />
          <ReceiptLine
            styles={styles}
            label={chargeLabel(t, t('taxService.tax'), taxService.taxEnabled, taxService.taxRatePercent)}
            piastres={totals.taxPiastres}
          />
          <View style={styles.divider} />
          <ReceiptLine styles={styles} label={t('taxService.total')} piastres={totals.totalPiastres} emphasize />
        </View>
        <View style={styles.tornEdgeRow}>
          {Array.from({ length: TORN_EDGE_NOTCHES }, (_, i) => (
            <View key={i} style={styles.tornEdgeNotch} />
          ))}
        </View>
      </View>

      {people.map((person, personIndex) => (
        <View key={personIndex} style={styles.personRow}>
          <View style={styles.personInfo}>
            <Text style={[styles.personName, userTextStyle(person.name, 'sansSemiBold', theme.fonts)]}>{person.name}</Text>
            <Text style={styles.personItems}>{describePersonItems(personIndex, items, itemAssignments)}</Text>
            {contextNote && <Text style={styles.contextNote}>{contextNote}</Text>}
          </View>
          <Text style={[theme.screenStyles.mono, styles.personAmount]}>
            {formatPiastresAsEGP(personTotals[personIndex])} EGP
          </Text>
        </View>
      ))}
    </>
  );
}

function ReceiptLine({
  styles,
  label,
  piastres,
  emphasize,
}: {
  styles: ReturnType<typeof useThemedStyles>;
  label: string;
  piastres: number;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.receiptLine}>
      <Text style={emphasize ? styles.receiptLabelEmphasis : styles.receiptLabel}>{label}</Text>
      <Text style={[styles.mono, emphasize ? styles.receiptValueEmphasis : styles.receiptValue]}>
        {formatPiastresAsEGP(piastres)}
      </Text>
    </View>
  );
}

/**
 * A person's line must not claim a charge is included when it isn't
 * (Story 1.3 established tax/service are independently toggleable and can
 * both be off — the SEA SOUL spike finding, now extended to other service).
 * Only describes charges that are actually enabled for this receipt.
 */

function describeIncludedCharges(taxService: TaxServiceSettings, t: Translate): string | null {
  const parts: string[] = [];
  if (taxService.discountEnabled) {
    parts.push(t('summary.chargeDiscount'));
  }
  if (taxService.taxEnabled) {
    parts.push(t('summary.chargeTax'));
  }
  if (taxService.serviceEnabled) {
    parts.push(t('summary.chargeService'));
  }
  if (taxService.otherServiceEnabled) {
    parts.push(t('summary.chargeOtherService'));
  }
  if (parts.length === 0) {
    return t('summary.noCharges');
  }
  return t('summary.includesShareOf', { charges: joinWithAnd(parts, t('summary.listAnd')) });
}

/**
 * "tax and service", "the discount, tax and service". The conjunction comes
 * from the locale (Arabic's و attaches without a preceding comma, which is
 * why the Oxford comma is dropped rather than hardcoded).
 */
function joinWithAnd(parts: string[], and: string): string {
  if (parts.length === 1) {
    return parts[0];
  }
  const leading = parts.slice(0, -1).join(', ');
  return `${leading} ${and} ${parts[parts.length - 1]}`;
}

function useThemedStyles({ colors, cardShadow, screenStyles, fonts }: Theme) {
  return useMemo(
    () =>
      StyleSheet.create({
        photo: { width: '100%', height: 220, borderRadius: radii.lg, resizeMode: 'cover' },
        photoStripContent: { gap: spacing.sm },
        photoThumb: { width: 160, height: 220, borderRadius: radii.lg, resizeMode: 'cover' },

        // The one deliberate skeuomorphic touch — a receipt tears off the
        // till, it doesn't end in a clean rounded corner. The notch row
        // punches page-colored circles into the card's bottom edge to
        // fake that tear.
        receiptCard: {
          backgroundColor: colors.paperRaised,
          borderRadius: radii.md,
          ...cardShadow,
        },
        receiptBody: { padding: 18, gap: spacing.sm },
        receiptLine: { flexDirection: 'row', justifyContent: 'space-between' },
        receiptLabel: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.inkSoft },
        receiptValue: { fontSize: 13, color: colors.ink },
        receiptLabelEmphasis: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.ink },
        receiptValueEmphasis: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.ink },
        divider: { height: 1, backgroundColor: colors.line, marginVertical: 2 },
        tornEdgeRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
          marginTop: -7,
        },
        tornEdgeNotch: {
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: colors.paper,
        },

        personRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: colors.paperRaised,
          borderRadius: radii.md,
          paddingVertical: 13,
          paddingHorizontal: spacing.lg,
          ...cardShadow,
        },
        // flex + minWidth: 0 lets the name/note wrap and shrink to fit
        // instead of forcing the row wider than the screen (layout bug
        // found in the field — same class of overflow as the earlier
        // "Start New Split" button fix).
        personInfo: { flex: 1, minWidth: 0 },
        personName: { fontFamily: fonts.sansBold, fontSize: 15.5, color: colors.ink },
        personItems: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.inkSoft, marginTop: 2 },
        contextNote: { fontFamily: fonts.sansRegular, fontSize: 11.5, color: colors.inkFaint, marginTop: 2 },
        personAmount: { fontFamily: fonts.monoBold, fontSize: 17, flexShrink: 0, color: colors.ink },
        mono: screenStyles.mono,
      }),
    [colors, cardShadow, screenStyles],
  );
}
