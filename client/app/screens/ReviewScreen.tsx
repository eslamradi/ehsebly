import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  calculatePersonSubtotals,
  calculatePersonTotals,
} from '../domain/assignment';
import { formatPiastresAsEGP, parseEGPToPiastres } from '../domain/money';
import { RECONCILIATION_TOLERANCE_PIASTRES, reconcileWithPrintedTotal } from '../domain/reconciliation';
import { calculateSplitTotals, calculateSubtotalPiastres } from '../domain/splitCalculation';
import { useSplitSession, type Person } from '../domain/session';
import { fonts, radii, spacing, useTheme, type Theme, textAlignEnd } from '../theme';
import { useI18n } from '../i18n';
import { chargeLabel } from '../i18n/chargeLabel';
import type { Translate } from '../domain/share';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    itemCard: {
      backgroundColor: colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.xs,
      ...theme.cardShadow,
    },
    itemRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    nameInput: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.sm,
      paddingVertical: 8,
      paddingHorizontal: spacing.md,
      fontFamily: theme.fonts.sansRegular,
      color: colors.ink,
    },
    priceInput: {
      width: 92,
      flexShrink: 0,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.sm,
      paddingVertical: 8,
      paddingHorizontal: spacing.md,
      textAlign: textAlignEnd,
      color: colors.ink,
    },
    quantityBadge: { fontFamily: theme.fonts.sansSemiBold, fontSize: 13, color: colors.inkSoft, flexShrink: 0 },
    inputError: { borderColor: colors.critical },
    errorText: { fontFamily: theme.fonts.sansRegular, color: colors.critical, fontSize: 12 },
    assigneeText: { fontFamily: theme.fonts.sansRegular, fontSize: 13, color: colors.inkSoft },
    summaryPanel: {
      backgroundColor: colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.sm,
      ...theme.cardShadow,
    },
    divider: { height: 1, backgroundColor: colors.line, marginVertical: 2 },
    mismatchBlock: { gap: spacing.xs, alignItems: 'flex-start' },
    reconciliationDetail: { fontFamily: theme.fonts.sansRegular, color: colors.inkSoft, fontSize: 12.5, lineHeight: 18 },
    reconciliationNeutral: { fontFamily: theme.fonts.sansRegular, color: colors.inkSoft, fontSize: 13 },
    previewPanel: {
      backgroundColor: colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.sm,
      ...theme.cardShadow,
    },
    previewLine: { flexDirection: 'row', justifyContent: 'space-between' },
    previewLabel: { fontFamily: theme.fonts.sansRegular, fontSize: 14, color: colors.inkSoft },
    previewValue: { fontSize: 14, color: colors.ink },
    previewLabelEmphasis: { fontFamily: theme.fonts.sansBold, fontSize: 16, color: colors.ink },
    previewValueEmphasis: { fontFamily: theme.fonts.monoBold, fontSize: 16, color: colors.ink },
    mono: theme.screenStyles.mono,
    actions: { gap: spacing.md },
  });
}

/**
 * FR-9's mandatory review-and-edit step, plus FR-10's printed-total
 * reconciliation. Editable surface is item name/price only (FR-9's
 * literal text) — tax/service rate (Story 1.3) and item assignment
 * (Story 1.5) are shown read-only here and edited on their own screens.
 * Editing an item re-triggers the same `setExtractionResult` full-object
 * replace every other screen already uses, so per-person totals below
 * recompute on every render with no extra plumbing (AC #2).
 */
export default function ReviewScreen({ navigation }: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const { buttonStyles, screenStyles } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const { session, setExtractionResult } = useSplitSession();
  const { extractionResult, taxService, people, itemAssignments } = session;

  // Same draft-then-commit-on-blur pattern as ExtractedItemsScreen's price
  // field (Story 1.2 code review finding: committing on every keystroke
  // reformats the field mid-typing). Item name has no display reformatting
  // to fight with, but a blank name is still a real mistake worth guarding
  // against here (code review finding, Story 1.6) — so it also gets a
  // draft-then-commit-on-blur pair, rejecting an empty/whitespace-only
  // commit and keeping the previous name, with the same visible-error
  // pattern the price field already uses.
  const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({});
  const [nameErrors, setNameErrors] = useState<Record<number, boolean>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [priceErrors, setPriceErrors] = useState<Record<number, boolean>>({});

  const handleBack = () => {
    navigation.navigate('ItemAssignment');
  };

  if (!extractionResult || extractionResult.status !== 'ok' || !taxService) {
    // Defensive: this screen is only reached once extraction, tax/service,
    // and assignment have all completed, but guard against stale/cleared
    // session state rather than crashing on `extractionResult.items`.
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>{t('review.nothingToReview')}</Text>
        <Pressable accessibilityLabel={t('review.a11yBackToAssignment')} style={buttonStyles.primary} onPress={handleBack}>
          <Text style={buttonStyles.primaryText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const items = extractionResult.items;

  const commitNameDraft = (index: number) => {
    const draft = nameDrafts[index];
    if (draft === undefined) {
      return;
    }
    const trimmed = draft.trim();
    if (trimmed.length > 0) {
      const nextItems = items.map((item, i) => (i === index ? { ...item, name: trimmed } : item));
      setExtractionResult({ ...extractionResult, items: nextItems });
      setNameErrors((previous) => ({ ...previous, [index]: false }));
    } else {
      // Blank/whitespace-only name is rejected — the field reverts to the
      // last valid name below — but flag it rather than silently
      // reverting with no feedback (same discipline as the price field).
      setNameErrors((previous) => ({ ...previous, [index]: true }));
    }
    setNameDrafts((previous) => {
      const next = { ...previous };
      delete next[index];
      return next;
    });
  };

  const commitPriceDraft = (index: number) => {
    const draft = priceDrafts[index];
    if (draft === undefined) {
      return;
    }
    const parsed = parseEGPToPiastres(draft);
    if (parsed !== null) {
      const nextItems = items.map((item, i) => (i === index ? { ...item, pricePiastres: parsed } : item));
      setExtractionResult({ ...extractionResult, items: nextItems });
      setPriceErrors((previous) => ({ ...previous, [index]: false }));
    } else {
      setPriceErrors((previous) => ({ ...previous, [index]: true }));
    }
    setPriceDrafts((previous) => {
      const next = { ...previous };
      delete next[index];
      return next;
    });
  };

  const subtotalPiastres = calculateSubtotalPiastres(items);
  const totals = calculateSplitTotals({ subtotalPiastres, ...taxService });
  const personSubtotals = calculatePersonSubtotals(items, itemAssignments, people.length);
  const personTotals = calculatePersonTotals(personSubtotals, totals);
  // A group expense writes to a ledger other people settle against, so the
  // button says so instead of the generic "Confirm breakdown" — the commit is
  // the moment worth naming.
  const commitLabel = session.group
    ? t('final.postToGroup', { group: session.group.groupName })
    : t('review.confirm');

  const reconciliation = reconcileWithPrintedTotal(
    totals.totalPiastres,
    extractionResult.printedTotalPiastres,
    RECONCILIATION_TOLERANCE_PIASTRES,
  );

  const handleConfirm = () => {
    navigation.navigate('FinalSplit');
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>{t('review.title')}</Text>
      <Text style={screenStyles.subheading}>{t('review.subtitle')}</Text>

      {items.map((item, index) => {
        const allocations = itemAssignments[index] ?? {};
        const assigneeSummary = describeAllocations(allocations, people, t);
        return (
          <View key={index} style={styles.itemCard}>
            <View style={styles.itemRow}>
              <TextInput
                accessibilityLabel={t('review.a11yItemName', { index: index + 1 })}
                style={[styles.nameInput, nameErrors[index] && styles.inputError]}
                value={nameDrafts[index] ?? item.name}
                onChangeText={(text) => {
                  setNameDrafts((previous) => ({ ...previous, [index]: text }));
                  setNameErrors((previous) => ({ ...previous, [index]: false }));
                }}
                onBlur={() => commitNameDraft(index)}
              />
              <TextInput
                accessibilityLabel={t('review.a11yItemPrice', { index: index + 1 })}
                style={[styles.priceInput, styles.mono, priceErrors[index] && styles.inputError]}
                keyboardType="decimal-pad"
                value={priceDrafts[index] ?? formatPiastresAsEGP(item.pricePiastres)}
                onChangeText={(text) => {
                  setPriceDrafts((previous) => ({ ...previous, [index]: text }));
                  setPriceErrors((previous) => ({ ...previous, [index]: false }));
                }}
                onBlur={() => commitPriceDraft(index)}
              />
              {item.quantity > 1 && <Text style={styles.quantityBadge}>×{item.quantity}</Text>}
            </View>
            {nameErrors[index] && (
              <Text style={styles.errorText}>{t('review.nameBlank')}</Text>
            )}
            {priceErrors[index] && (
              <Text style={styles.errorText}>{t('review.priceUnreadable')}</Text>
            )}
            <Text style={styles.assigneeText}>{assigneeSummary}</Text>
          </View>
        );
      })}

      <View style={styles.summaryPanel}>
        <SummaryLine styles={styles} label={t('taxService.subtotal')} piastres={totals.subtotalPiastres} />
        <SummaryLine
          styles={styles}
          label={chargeLabel(
            t,
            t('taxService.discount'),
            taxService.discountEnabled,
            taxService.discountMode === 'percent' ? taxService.discountRatePercent : null,
          )}
          piastres={-totals.discountPiastres}
        />
        <SummaryLine
          styles={styles}
          label={chargeLabel(t, t('taxService.service'), taxService.serviceEnabled, taxService.serviceRatePercent)}
          piastres={totals.servicePiastres}
        />
        <SummaryLine
          styles={styles}
          label={chargeLabel(
            t,
            t('taxService.otherService'),
            taxService.otherServiceEnabled,
            taxService.otherServiceRatePercent,
          )}
          piastres={totals.otherServicePiastres}
        />
        <SummaryLine
          styles={styles}
          label={chargeLabel(t, t('taxService.tax'), taxService.taxEnabled, taxService.taxRatePercent)}
          piastres={totals.taxPiastres}
        />
        <View style={styles.divider} />
        <SummaryLine styles={styles} label={t('taxService.total')} piastres={totals.totalPiastres} emphasize />
      </View>

      <ReconciliationBanner
        theme={theme}
        styles={styles}
        reconciliation={reconciliation}
        computedTotalPiastres={totals.totalPiastres}
        printedTotalPiastres={extractionResult.printedTotalPiastres}
      />

      <View style={styles.previewPanel}>
        {people.map((person, personIndex) => (
          <View key={personIndex} style={styles.previewLine}>
            <Text style={styles.previewLabel}>{person.name}</Text>
            <Text style={[styles.previewValue, styles.mono]}>{formatPiastresAsEGP(personTotals[personIndex])} EGP</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityLabel={commitLabel} style={buttonStyles.primary} onPress={handleConfirm}>
          <Text style={buttonStyles.primaryText}>{commitLabel}</Text>
        </Pressable>
        <Pressable accessibilityLabel={t('review.a11yBackToAssignment')} style={buttonStyles.secondary} onPress={handleBack}>
          <Text style={buttonStyles.secondaryText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/** e.g. "Alice ×3, Bob ×1" for a multi-quantity item, or plain names when every allocation is a single unit. */
/** `t` is injected — plain helper, no hook available. */
function describeAllocations(allocations: Record<number, number>, people: Person[], t: Translate): string {
  const parts = Object.entries(allocations)
    .map(([personIndexText, count]) => [Number(personIndexText), count] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([personIndex, count]) => {
      const name = people[personIndex]?.name ?? '?';
      return count > 1 ? `${name} ×${count}` : name;
    });
  return parts.length > 0 ? parts.join(', ') : t('review.unassigned');
}

function SummaryLine({
  styles,
  label,
  piastres,
  emphasize,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  piastres: number;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.previewLine}>
      <Text style={emphasize ? styles.previewLabelEmphasis : styles.previewLabel}>{label}</Text>
      <Text style={[styles.mono, emphasize ? styles.previewValueEmphasis : styles.previewValue]}>
        {formatPiastresAsEGP(piastres)} EGP
      </Text>
    </View>
  );
}

function ReconciliationBanner({
  theme,
  styles,
  reconciliation,
  computedTotalPiastres,
  printedTotalPiastres,
}: {
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
  reconciliation: ReturnType<typeof reconcileWithPrintedTotal>;
  computedTotalPiastres: number;
  printedTotalPiastres: number | undefined;
}) {
  const { t } = useI18n();
  if (reconciliation.status === 'unknown') {
    return (
      <Text style={styles.reconciliationNeutral}>
        No printed total detected on this receipt — can&apos;t automatically check against it.
      </Text>
    );
  }
  if (reconciliation.status === 'match') {
    return (
      <View style={theme.pillStyle('positive')}>
        <Text style={theme.pillTextStyle('positive')}>{t('review.matchesReceipt')}</Text>
      </View>
    );
  }
  const diffEGP = formatPiastresAsEGP(Math.abs(reconciliation.diffPiastres));
  return (
    <View style={styles.mismatchBlock}>
      <View style={theme.pillStyle('critical')}>
        <Text style={theme.pillTextStyle('critical')}>{t('review.doesntMatchReceipt')}</Text>
      </View>
      <Text style={styles.reconciliationDetail}>
        {t('review.reconciliationDetail', {
          computed: formatPiastresAsEGP(computedTotalPiastres),
          printed: formatPiastresAsEGP(printedTotalPiastres ?? 0),
          diff: diffEGP,
        })}
      </Text>
    </View>
  );
}
