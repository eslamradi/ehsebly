import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatPiastresAsEGP, parseEGPToPiastres, parsePercentInput } from '../domain/money';
import { calculateSplitTotals } from '../domain/splitCalculation';
import type { TaxServiceSettings } from '../domain/splitCalculation';
import { radii, spacing, useTheme, type Theme, textAlignEnd } from '../theme';
import { useI18n } from '../i18n';

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    // One ledger card: the charge rows and the totals are the same object
    // now, so a row's amount sits on the row that produces it.
    ledger: {
      backgroundColor: colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.md,
      ...theme.cardShadow,
    },
    ledgerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
    ledgerLabel: { flex: 1, minWidth: 0, fontFamily: theme.fonts.sansRegular, fontSize: 14, color: colors.inkSoft },
    ledgerLabelEmphasis: { flex: 1, minWidth: 0, fontFamily: theme.fonts.sansBold, fontSize: 15, color: colors.ink },
    ledgerValue: { minWidth: 72, textAlign: textAlignEnd, fontSize: 14, color: colors.ink },
    ledgerValueEmphasis: { minWidth: 72, textAlign: textAlignEnd, fontFamily: theme.fonts.monoSemiBold, fontSize: 15, color: colors.ink },
    ledgerDivider: { height: 1, backgroundColor: colors.line },
    // The extraction's own note about a printed discount, sitting under the
    // subtotal it refers to rather than floating as a loose paragraph.
    subtotalNote: { fontFamily: theme.fonts.sansRegular, fontSize: 12, color: colors.inkFaint, marginTop: -spacing.xs },
    rateFieldWrapper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    valueInput: {
      minWidth: 54,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.sm,
      paddingVertical: 6,
      paddingHorizontal: spacing.sm,
      textAlign: 'center',
      fontFamily: theme.fonts.monoRegular,
      fontSize: 14,
      color: colors.ink,
    },
    offText: { fontFamily: theme.fonts.sansRegular, fontSize: 13, color: colors.inkFaint },
    // `✕`/`+` rather than a Switch: the row has to hold a label, a rate,
    // an amount and a control on one line, and "remove this charge" is
    // what the action means.
    chargeToggle: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chargeToggleText: { fontFamily: theme.fonts.sansSemiBold, fontSize: 16, color: colors.accent },
    modeText: { fontFamily: theme.fonts.sansSemiBold, fontSize: 12, color: colors.inkSoft },
    modeTextActive: { color: colors.accentInk },

    inputError: { borderColor: colors.critical },
    errorText: { fontFamily: theme.fonts.sansRegular, color: colors.critical, fontSize: 12 },
    percentSign: { fontFamily: theme.fonts.sansRegular, fontSize: 16, color: colors.inkSoft },
    modeRow: { flexDirection: 'row', gap: spacing.sm },
    modeButton: {
      paddingVertical: 6,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.line,
    },
    modeButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    mono: theme.screenStyles.mono,
  });
}

export type ChargesLedgerHandle = {
  /**
   * Commits every field still mid-edit. Returns false if any draft was
   * unparseable, so the host screen can stay put and let the fronter see the
   * error rather than navigating away in the same tick it was raised.
   */
  commitAll: () => boolean;
};

type Props = {
  taxService: TaxServiceSettings;
  setTaxService: (update: (previous: TaxServiceSettings) => TaxServiceSettings) => void;
  subtotalPiastres: number;
  /** Extraction's note about a printed discount, shown under the subtotal. */
  discountNote?: string;
};

/**
 * Subtotal, the four editable charges, and the total — one card that is both
 * the editor and the summary.
 *
 * This was its own screen (`TaxServiceScreen`) until the flow consolidation
 * of 2026-08-09. It lives here as a component because the merged "Check the
 * receipt" screen renders it below the item list, and inlining ~250 lines of
 * draft/error/commit state into that screen would have buried the item
 * editing it sits under. The state boundary is the point: the host owns
 * items, this owns charges, and they meet at `commitAll()`.
 */
export const ChargesLedger = forwardRef<ChargesLedgerHandle, Props>(function ChargesLedger(
  { taxService, setTaxService, subtotalPiastres, discountNote },
  ref,
) {
  const theme = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Draft text for the rate fields, committed on blur only — same pattern
  // the item list uses for prices (Story 1.2 code review finding:
  // committing on every keystroke reformats the field mid-typing).
  const [taxRateDraft, setTaxRateDraft] = useState<string | null>(null);
  const [serviceRateDraft, setServiceRateDraft] = useState<string | null>(null);
  const [otherServiceRateDraft, setOtherServiceRateDraft] = useState<string | null>(null);
  // Separate drafts for the two discount value fields — switching mode
  // shouldn't lose whatever the fronter already typed in the other one.
  const [discountPercentDraft, setDiscountPercentDraft] = useState<string | null>(null);
  const [discountFlatDraft, setDiscountFlatDraft] = useState<string | null>(null);
  // Whether the last blur on each field was rejected as unparseable —
  // shown as a brief cue rather than silently reverting with no feedback
  // (code review finding, Story 1.3).
  const [taxRateError, setTaxRateError] = useState(false);
  const [serviceRateError, setServiceRateError] = useState(false);
  const [otherServiceRateError, setOtherServiceRateError] = useState(false);
  const [discountError, setDiscountError] = useState(false);

  const totals = calculateSplitTotals({ subtotalPiastres, ...taxService });

  // Uses the setTaxService updater form so that committing several fields
  // back to back in one handler composes against the true latest state
  // instead of several stale copies of the same closure.
  const commitTaxRateDraft = (): boolean => {
    if (taxRateDraft === null) {
      return true;
    }
    const parsed = parsePercentInput(taxRateDraft);
    if (parsed === null) {
      setTaxRateError(true);
      setTaxRateDraft(null);
      return false;
    }
    setTaxService((previous) => ({ ...previous, taxRatePercent: parsed }));
    setTaxRateError(false);
    setTaxRateDraft(null);
    return true;
  };

  const commitServiceRateDraft = (): boolean => {
    if (serviceRateDraft === null) {
      return true;
    }
    const parsed = parsePercentInput(serviceRateDraft);
    if (parsed === null) {
      setServiceRateError(true);
      setServiceRateDraft(null);
      return false;
    }
    setTaxService((previous) => ({ ...previous, serviceRatePercent: parsed }));
    setServiceRateError(false);
    setServiceRateDraft(null);
    return true;
  };

  const commitOtherServiceRateDraft = (): boolean => {
    if (otherServiceRateDraft === null) {
      return true;
    }
    const parsed = parsePercentInput(otherServiceRateDraft);
    if (parsed === null) {
      setOtherServiceRateError(true);
      setOtherServiceRateDraft(null);
      return false;
    }
    setTaxService((previous) => ({ ...previous, otherServiceRatePercent: parsed }));
    setOtherServiceRateError(false);
    setOtherServiceRateDraft(null);
    return true;
  };

  const commitDiscountPercentDraft = (): boolean => {
    if (discountPercentDraft === null) {
      return true;
    }
    const parsed = parsePercentInput(discountPercentDraft);
    if (parsed === null) {
      setDiscountError(true);
      setDiscountPercentDraft(null);
      return false;
    }
    setTaxService((previous) => ({ ...previous, discountRatePercent: parsed }));
    setDiscountError(false);
    setDiscountPercentDraft(null);
    return true;
  };

  const commitDiscountFlatDraft = (): boolean => {
    if (discountFlatDraft === null) {
      return true;
    }
    const parsed = parseEGPToPiastres(discountFlatDraft);
    if (parsed === null) {
      setDiscountError(true);
      setDiscountFlatDraft(null);
      return false;
    }
    setTaxService((previous) => ({ ...previous, discountFlatPiastres: parsed }));
    setDiscountError(false);
    setDiscountFlatDraft(null);
    return true;
  };

  // Commits whichever of the two discount fields is currently active —
  // the inactive one's draft (if any) is left pending, same as leaving any
  // other field mid-edit.
  const commitActiveDiscountDraft = (): boolean =>
    taxService.discountMode === 'percent' ? commitDiscountPercentDraft() : commitDiscountFlatDraft();

  useImperativeHandle(ref, () => ({
    commitAll: () => {
      // Every commit runs before the verdict is taken: `&&` would short-circuit
      // and leave later fields' drafts pending and their errors unraised.
      const tax = commitTaxRateDraft();
      const service = commitServiceRateDraft();
      const otherService = commitOtherServiceRateDraft();
      const discount = commitActiveDiscountDraft();
      return tax && service && otherService && discount;
    },
  }));

  const handleDiscountToggle = (value: boolean) => {
    commitActiveDiscountDraft();
    setTaxService((previous) => ({ ...previous, discountEnabled: value }));
  };

  const handleDiscountModeChange = (mode: 'flat' | 'percent') => {
    commitActiveDiscountDraft();
    setTaxService((previous) => ({ ...previous, discountMode: mode }));
  };

  const handleTaxToggle = (value: boolean) => {
    const parsed = taxRateDraft === null ? null : parsePercentInput(taxRateDraft);
    const invalid = taxRateDraft !== null && parsed === null;
    setTaxService((previous) => ({
      ...previous,
      taxEnabled: value,
      taxRatePercent: parsed ?? previous.taxRatePercent,
    }));
    setTaxRateError(invalid);
    setTaxRateDraft(null);
  };

  const handleServiceToggle = (value: boolean) => {
    const parsed = serviceRateDraft === null ? null : parsePercentInput(serviceRateDraft);
    const invalid = serviceRateDraft !== null && parsed === null;
    setTaxService((previous) => ({
      ...previous,
      serviceEnabled: value,
      serviceRatePercent: parsed ?? previous.serviceRatePercent,
    }));
    setServiceRateError(invalid);
    setServiceRateDraft(null);
  };

  const handleOtherServiceToggle = (value: boolean) => {
    const parsed = otherServiceRateDraft === null ? null : parsePercentInput(otherServiceRateDraft);
    const invalid = otherServiceRateDraft !== null && parsed === null;
    setTaxService((previous) => ({
      ...previous,
      otherServiceEnabled: value,
      otherServiceRatePercent: parsed ?? previous.otherServiceRatePercent,
    }));
    setOtherServiceRateError(invalid);
    setOtherServiceRateDraft(null);
  };

  return (
    <View style={styles.ledger}>
      <View style={styles.ledgerLine}>
        <Text style={styles.ledgerLabel}>{t('taxService.subtotal')}</Text>
        <Text style={[styles.mono, styles.ledgerValue]}>{formatPiastresAsEGP(totals.subtotalPiastres)}</Text>
      </View>
      {discountNote ? <Text style={styles.subtotalNote}>{discountNote}</Text> : null}

      {/* Discount is its own row rather than a ChargeRow: its value is
          either a percentage or a flat amount, so it carries a mode
          selector the others have no use for. */}
      <View style={styles.ledgerLine}>
        <Text style={styles.ledgerLabel}>{t('taxService.discount')}</Text>
        {taxService.discountEnabled ? (
          <>
            <View style={styles.modeRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: taxService.discountMode === 'percent' }}
                accessibilityLabel={t('taxService.a11yDiscountPercentMode')}
                style={[styles.modeButton, taxService.discountMode === 'percent' && styles.modeButtonActive]}
                onPress={() => handleDiscountModeChange('percent')}
              >
                <Text style={[styles.modeText, taxService.discountMode === 'percent' && styles.modeTextActive]}>%</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: taxService.discountMode === 'flat' }}
                accessibilityLabel={t('taxService.a11yDiscountFlatMode')}
                style={[styles.modeButton, taxService.discountMode === 'flat' && styles.modeButtonActive]}
                onPress={() => handleDiscountModeChange('flat')}
              >
                <Text style={[styles.modeText, taxService.discountMode === 'flat' && styles.modeTextActive]}>
                  {t('common.egp')}
                </Text>
              </Pressable>
            </View>
            {taxService.discountMode === 'percent' ? (
              <TextInput
                accessibilityLabel={t('taxService.a11yDiscountRate')}
                style={[styles.valueInput, discountError && styles.inputError]}
                keyboardType="decimal-pad"
                value={discountPercentDraft ?? String(taxService.discountRatePercent)}
                onChangeText={(text) => {
                  setDiscountPercentDraft(text);
                  setDiscountError(false);
                }}
                onBlur={commitDiscountPercentDraft}
              />
            ) : (
              <TextInput
                accessibilityLabel={t('taxService.a11yDiscountFlat')}
                style={[styles.valueInput, discountError && styles.inputError]}
                keyboardType="decimal-pad"
                value={discountFlatDraft ?? formatPiastresAsEGP(taxService.discountFlatPiastres)}
                onChangeText={(text) => {
                  setDiscountFlatDraft(text);
                  setDiscountError(false);
                }}
                onBlur={commitDiscountFlatDraft}
              />
            )}
            <Text style={[styles.mono, styles.ledgerValue]}>-{formatPiastresAsEGP(totals.discountPiastres)}</Text>
          </>
        ) : (
          <Text style={styles.offText}>{t('taxService.off')}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: taxService.discountEnabled }}
          accessibilityLabel={t('taxService.a11yDiscountToggle')}
          style={styles.chargeToggle}
          onPress={() => handleDiscountToggle(!taxService.discountEnabled)}
        >
          <Text style={styles.chargeToggleText}>{taxService.discountEnabled ? '✕' : '+'}</Text>
        </Pressable>
      </View>
      {discountError && <Text style={styles.errorText}>{t('taxService.valueUnreadable')}</Text>}

      <ChargeRow
        styles={styles}
        label={t('taxService.service')}
        enabled={taxService.serviceEnabled}
        ratePercent={taxService.serviceRatePercent}
        rateDraft={serviceRateDraft}
        onRateChange={(text) => {
          setServiceRateDraft(text);
          setServiceRateError(false);
        }}
        onRateBlur={commitServiceRateDraft}
        onToggle={() => handleServiceToggle(!taxService.serviceEnabled)}
        amountPiastres={totals.servicePiastres}
        hasError={serviceRateError}
        errorText={t('taxService.rateUnreadable')}
        offLabel={t('taxService.off')}
        a11yToggle={t('taxService.a11yServiceToggle')}
        a11yRate={t('taxService.a11yServiceRate')}
      />

      <ChargeRow
        styles={styles}
        label={t('taxService.otherService')}
        enabled={taxService.otherServiceEnabled}
        ratePercent={taxService.otherServiceRatePercent}
        rateDraft={otherServiceRateDraft}
        onRateChange={(text) => {
          setOtherServiceRateDraft(text);
          setOtherServiceRateError(false);
        }}
        onRateBlur={commitOtherServiceRateDraft}
        onToggle={() => handleOtherServiceToggle(!taxService.otherServiceEnabled)}
        amountPiastres={totals.otherServicePiastres}
        hasError={otherServiceRateError}
        errorText={t('taxService.rateUnreadable')}
        offLabel={t('taxService.off')}
        a11yToggle={t('taxService.a11yOtherServiceToggle')}
        a11yRate={t('taxService.a11yOtherServiceRate')}
      />

      <ChargeRow
        styles={styles}
        label={t('taxService.tax')}
        enabled={taxService.taxEnabled}
        ratePercent={taxService.taxRatePercent}
        rateDraft={taxRateDraft}
        onRateChange={(text) => {
          setTaxRateDraft(text);
          setTaxRateError(false);
        }}
        onRateBlur={commitTaxRateDraft}
        onToggle={() => handleTaxToggle(!taxService.taxEnabled)}
        amountPiastres={totals.taxPiastres}
        hasError={taxRateError}
        errorText={t('taxService.rateUnreadable')}
        offLabel={t('taxService.off')}
        a11yToggle={t('taxService.a11yTaxToggle')}
        a11yRate={t('taxService.a11yTaxRate')}
      />

      <View style={styles.ledgerDivider} />
      <View style={styles.ledgerLine}>
        <Text style={styles.ledgerLabelEmphasis}>{t('taxService.total')}</Text>
        <Text style={[styles.mono, styles.ledgerValueEmphasis]}>{formatPiastresAsEGP(totals.totalPiastres)}</Text>
      </View>
    </View>
  );
});

/**
 * One percentage-based charge, rendered as a single ledger row that is also
 * its own editor: `Service · 12%    +39.24  ✕`.
 *
 * Switched off it reads `Service    off  +` and keeps the rate it was last
 * set to, so turning it back on restores what the receipt said rather than
 * zeroing it. The toggle is a `✕`/`+` rather than a Switch because the row
 * has to fit a label, a rate field, an amount and a control on one line, and
 * because "remove this charge" is what the action actually means here.
 */
function ChargeRow({
  styles,
  label,
  enabled,
  ratePercent,
  rateDraft,
  onRateChange,
  onRateBlur,
  onToggle,
  amountPiastres,
  hasError,
  errorText,
  offLabel,
  a11yToggle,
  a11yRate,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  enabled: boolean;
  ratePercent: number;
  rateDraft: string | null;
  onRateChange: (text: string) => void;
  onRateBlur: () => void;
  onToggle: () => void;
  amountPiastres: number;
  hasError: boolean;
  errorText: string;
  offLabel: string;
  a11yToggle: string;
  a11yRate: string;
}) {
  return (
    <>
      <View style={styles.ledgerLine}>
        <Text style={styles.ledgerLabel}>{label}</Text>
        {enabled ? (
          <>
            <View style={styles.rateFieldWrapper}>
              <TextInput
                accessibilityLabel={a11yRate}
                style={[styles.valueInput, hasError && styles.inputError]}
                keyboardType="decimal-pad"
                value={rateDraft ?? String(ratePercent)}
                onChangeText={onRateChange}
                onBlur={onRateBlur}
              />
              <Text style={styles.percentSign}>%</Text>
            </View>
            <Text style={[styles.mono, styles.ledgerValue]}>{formatPiastresAsEGP(amountPiastres)}</Text>
          </>
        ) : (
          <Text style={styles.offText}>{offLabel}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: enabled }}
          accessibilityLabel={a11yToggle}
          style={styles.chargeToggle}
          onPress={onToggle}
        >
          <Text style={styles.chargeToggleText}>{enabled ? '✕' : '+'}</Text>
        </Pressable>
      </View>
      {hasError && <Text style={styles.errorText}>{errorText}</Text>}
    </>
  );
}
