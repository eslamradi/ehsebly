import { StyleSheet, Text, View } from 'react-native';
import { formatPiastresAsEGP } from '../domain/money';
import { RECONCILIATION_TOLERANCE_PIASTRES, reconcileWithPrintedTotal } from '../domain/reconciliation';
import { spacing, useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    block: { gap: spacing.xs, alignItems: 'flex-start' },
    detail: { fontFamily: theme.fonts.sansRegular, color: theme.colors.inkSoft, fontSize: 12.5, lineHeight: 18 },
    neutral: { fontFamily: theme.fonts.sansRegular, color: theme.colors.inkSoft, fontSize: 13 },
  });
}

/**
 * The computed total against the one printed on the receipt — the check that
 * tells the fronter whether to trust the breakdown.
 *
 * It lived on ReviewScreen until that screen was removed in the flow
 * consolidation of 2026-08-09. It moved rather than being deleted because
 * the verdict is the reason the step existed; what was redundant was the
 * screen around it, not the reconciliation.
 */
export function ReconciliationBanner({
  computedTotalPiastres,
  printedTotalPiastres,
}: {
  computedTotalPiastres: number;
  printedTotalPiastres: number | undefined;
}) {
  const theme = useTheme();
  const { t } = useI18n();
  const styles = makeStyles(theme);

  const reconciliation = reconcileWithPrintedTotal(
    computedTotalPiastres,
    printedTotalPiastres,
    RECONCILIATION_TOLERANCE_PIASTRES,
  );

  if (reconciliation.status === 'unknown') {
    return <Text style={styles.neutral}>{t('reconcile.noPrintedTotal')}</Text>;
  }

  if (reconciliation.status === 'match') {
    return (
      <View style={theme.pillStyle('positive')}>
        <Text style={theme.pillTextStyle('positive')}>{t('reconcile.matchesReceipt')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View style={theme.pillStyle('critical')}>
        <Text style={theme.pillTextStyle('critical')}>{t('reconcile.doesntMatchReceipt')}</Text>
      </View>
      <Text style={styles.detail}>
        {t('reconcile.reconciliationDetail', {
          computed: formatPiastresAsEGP(computedTotalPiastres),
          printed: formatPiastresAsEGP(printedTotalPiastres ?? 0),
          diff: formatPiastresAsEGP(Math.abs(reconciliation.diffPiastres)),
        })}
      </Text>
    </View>
  );
}
