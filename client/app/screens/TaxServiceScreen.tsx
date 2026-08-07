import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatPiastresAsEGP, parseEGPToPiastres, parsePercentInput } from '../domain/money';
import { calculateSplitTotals, calculateSubtotalPiastres } from '../domain/splitCalculation';
import { useSplitSession } from '../domain/session';
import { fonts, radii, spacing, useTheme, type Theme } from '../theme';
import { useI18n } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TaxService'>;

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
        rateCard: {
          backgroundColor: colors.paperRaised,
          borderRadius: radii.md,
          padding: spacing.lg,
          gap: spacing.sm,
          ...theme.cardShadow,
        },
        rateLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        rateName: { fontFamily: theme.fonts.sansSemiBold, fontSize: 16, color: colors.ink },
        rateInputWrapper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        rateInput: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.sm,
          paddingVertical: 8,
          paddingHorizontal: spacing.md,
          fontFamily: theme.fonts.monoRegular,
          color: colors.ink,
        },
        rateInputDisabled: { backgroundColor: colors.paper, color: colors.inkFaint },
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
        modeButtonText: { fontFamily: theme.fonts.sansSemiBold, fontSize: 13, color: colors.inkSoft },
        modeButtonTextActive: { color: colors.accentInk },
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
 * Confirms whether tax/service/other-service apply to this receipt and at
 * what rate (Story 1.3 AC #1-#3, extended with a third percentage-only
 * charge for a second service-style line some receipts print separately,
 * e.g. "delivery service 10%"). A plain flat delivery charge with no
 * percentage isn't handled here — that's added as an ordinary item on
 * ExtractedItemsScreen instead. `session.taxService` is already populated
 * by ExtractedItemsScreen's Continue handler before navigating here — this
 * screen only displays and edits it, plus shows a live compounded total
 * preview via `calculateSplitTotals`.
 */
export default function TaxServiceScreen({ navigation }: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const { colors, buttonStyles, screenStyles } = theme;
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const { session, setTaxService } = useSplitSession();
  const { extractionResult, taxService } = session;

  // Draft text for the rate fields, committed on blur only — same pattern
  // ExtractedItemsScreen uses for prices (Story 1.2 code review finding:
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

  if (!extractionResult || extractionResult.status !== 'ok' || !taxService) {
    // Defensive: this screen is only navigated to after ExtractedItemsScreen
    // has populated both, but guard against stale/cleared session state
    // rather than crashing on `extractionResult.items` or `taxService.*`.
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>{t('taxService.nothingToConfirm')}</Text>
        <Pressable
          accessibilityLabel={t('taxService.a11yBackToExtracted')}
          style={buttonStyles.primary}
          onPress={() => navigation.navigate('ExtractedItems')}
        >
          <Text style={buttonStyles.primaryText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const subtotalPiastres = calculateSubtotalPiastres(extractionResult.items);
  const totals = calculateSplitTotals({ subtotalPiastres, ...taxService });

  // Commits a field's pending draft, if any. Returns false (and raises the
  // field's error flag) when the draft was unparseable, so callers that chain
  // both fields' commits (handleBack) can tell whether it's safe to navigate
  // away, rather than discarding the error silently (code review finding,
  // Story 1.5 review of this screen). Uses the setTaxService updater form so
  // that committing both fields back to back in one handler composes against
  // the true latest state instead of two stale copies of the same closure.
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
  // other screen field mid-edit.
  const commitActiveDiscountDraft = (): boolean =>
    taxService.discountMode === 'percent' ? commitDiscountPercentDraft() : commitDiscountFlatDraft();

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

  const handleBack = () => {
    const taxCommitted = commitTaxRateDraft();
    const serviceCommitted = commitServiceRateDraft();
    const otherServiceCommitted = commitOtherServiceRateDraft();
    const discountCommitted = commitActiveDiscountDraft();
    if (!taxCommitted || !serviceCommitted || !otherServiceCommitted || !discountCommitted) {
      // Stay put so the fronter can see and fix the error text instead of
      // navigating away in the same tick it was raised (code review finding,
      // Story 1.5 review of this screen).
      return;
    }
    navigation.navigate('ExtractedItems');
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>{t('taxService.title')}</Text>

      <View style={styles.rateCard}>
        <View style={styles.rateLabel}>
          <Text style={styles.rateName}>{t('taxService.discount')}</Text>
          <Switch
            accessibilityLabel={t('taxService.a11yDiscountToggle')}
            value={taxService.discountEnabled}
            onValueChange={handleDiscountToggle}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.paperRaised}
          />
        </View>
        <View style={styles.modeRow}>
          <Pressable
            accessibilityLabel={t('taxService.a11yDiscountPercentMode')}
            style={[styles.modeButton, taxService.discountMode === 'percent' && styles.modeButtonActive]}
            onPress={() => handleDiscountModeChange('percent')}
          >
            <Text style={[styles.modeButtonText, taxService.discountMode === 'percent' && styles.modeButtonTextActive]}>
              %
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('taxService.a11yDiscountFlatMode')}
            style={[styles.modeButton, taxService.discountMode === 'flat' && styles.modeButtonActive]}
            onPress={() => handleDiscountModeChange('flat')}
          >
            <Text style={[styles.modeButtonText, taxService.discountMode === 'flat' && styles.modeButtonTextActive]}>
              EGP
            </Text>
          </Pressable>
        </View>
        {taxService.discountMode === 'percent' ? (
          <View style={styles.rateInputWrapper}>
            <TextInput
              accessibilityLabel={t('taxService.a11yDiscountRate')}
              style={[styles.rateInput, !taxService.discountEnabled && styles.rateInputDisabled, discountError && styles.inputError]}
              keyboardType="decimal-pad"
              editable={taxService.discountEnabled}
              value={discountPercentDraft ?? String(taxService.discountRatePercent)}
              onChangeText={(text) => {
                setDiscountPercentDraft(text);
                setDiscountError(false);
              }}
              onBlur={commitDiscountPercentDraft}
            />
            <Text style={styles.percentSign}>%</Text>
          </View>
        ) : (
          <View style={styles.rateInputWrapper}>
            <TextInput
              accessibilityLabel={t('taxService.a11yDiscountFlat')}
              style={[styles.rateInput, !taxService.discountEnabled && styles.rateInputDisabled, discountError && styles.inputError]}
              keyboardType="decimal-pad"
              editable={taxService.discountEnabled}
              value={discountFlatDraft ?? formatPiastresAsEGP(taxService.discountFlatPiastres)}
              onChangeText={(text) => {
                setDiscountFlatDraft(text);
                setDiscountError(false);
              }}
              onBlur={commitDiscountFlatDraft}
            />
          </View>
        )}
        {discountError && <Text style={styles.errorText}>{t('taxService.valueUnreadable')}</Text>}
      </View>

      <View style={styles.rateCard}>
        <View style={styles.rateLabel}>
          <Text style={styles.rateName}>{t('taxService.tax')}</Text>
          <Switch
            accessibilityLabel={t('taxService.a11yTaxToggle')}
            value={taxService.taxEnabled}
            onValueChange={handleTaxToggle}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.paperRaised}
          />
        </View>
        <View style={styles.rateInputWrapper}>
          <TextInput
            accessibilityLabel={t('taxService.a11yTaxRate')}
            style={[styles.rateInput, !taxService.taxEnabled && styles.rateInputDisabled, taxRateError && styles.inputError]}
            keyboardType="decimal-pad"
            editable={taxService.taxEnabled}
            value={taxRateDraft ?? String(taxService.taxRatePercent)}
            onChangeText={(text) => {
              setTaxRateDraft(text);
              setTaxRateError(false);
            }}
            onBlur={commitTaxRateDraft}
          />
          <Text style={styles.percentSign}>%</Text>
        </View>
        {taxRateError && <Text style={styles.errorText}>{t('taxService.rateUnreadable')}</Text>}
      </View>

      <View style={styles.rateCard}>
        <View style={styles.rateLabel}>
          <Text style={styles.rateName}>{t('taxService.service')}</Text>
          <Switch
            accessibilityLabel={t('taxService.a11yServiceToggle')}
            value={taxService.serviceEnabled}
            onValueChange={handleServiceToggle}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.paperRaised}
          />
        </View>
        <View style={styles.rateInputWrapper}>
          <TextInput
            accessibilityLabel={t('taxService.a11yServiceRate')}
            style={[
              styles.rateInput,
              !taxService.serviceEnabled && styles.rateInputDisabled,
              serviceRateError && styles.inputError,
            ]}
            keyboardType="decimal-pad"
            editable={taxService.serviceEnabled}
            value={serviceRateDraft ?? String(taxService.serviceRatePercent)}
            onChangeText={(text) => {
              setServiceRateDraft(text);
              setServiceRateError(false);
            }}
            onBlur={commitServiceRateDraft}
          />
          <Text style={styles.percentSign}>%</Text>
        </View>
        {serviceRateError && <Text style={styles.errorText}>{t('taxService.rateUnreadable')}</Text>}
      </View>

      <View style={styles.rateCard}>
        <View style={styles.rateLabel}>
          <Text style={styles.rateName}>{t('taxService.otherService')}</Text>
          <Switch
            accessibilityLabel={t('taxService.a11yOtherServiceToggle')}
            value={taxService.otherServiceEnabled}
            onValueChange={handleOtherServiceToggle}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.paperRaised}
          />
        </View>
        <View style={styles.rateInputWrapper}>
          <TextInput
            accessibilityLabel={t('taxService.a11yOtherServiceRate')}
            style={[
              styles.rateInput,
              !taxService.otherServiceEnabled && styles.rateInputDisabled,
              otherServiceRateError && styles.inputError,
            ]}
            keyboardType="decimal-pad"
            editable={taxService.otherServiceEnabled}
            value={otherServiceRateDraft ?? String(taxService.otherServiceRatePercent)}
            onChangeText={(text) => {
              setOtherServiceRateDraft(text);
              setOtherServiceRateError(false);
            }}
            onBlur={commitOtherServiceRateDraft}
          />
          <Text style={styles.percentSign}>%</Text>
        </View>
        {otherServiceRateError && (
          <Text style={styles.errorText}>{t('taxService.rateUnreadable')}</Text>
        )}
      </View>

      <View style={styles.previewPanel}>
        <PreviewLine styles={styles} label={t('taxService.subtotal')} piastres={totals.subtotalPiastres} />
        <PreviewLine
          styles={styles}
          label={
            taxService.discountEnabled && taxService.discountMode === 'percent'
              ? t('summary.withRate', { label: t('taxService.discount'), rate: taxService.discountRatePercent })
              : t('taxService.discount')
          }
          piastres={-totals.discountPiastres}
        />
        <PreviewLine styles={styles} label={t('taxService.service')} piastres={totals.servicePiastres} />
        <PreviewLine
          styles={styles}
          label={
            taxService.otherServiceEnabled
              ? t('summary.withRate', {
                  label: t('taxService.otherService'),
                  rate: taxService.otherServiceRatePercent,
                })
              : t('summary.disabled', { label: t('taxService.otherService') })
          }
          piastres={totals.otherServicePiastres}
        />
        <PreviewLine styles={styles} label={t('taxService.tax')} piastres={totals.taxPiastres} />
        <PreviewLine styles={styles} label={t('taxService.total')} piastres={totals.totalPiastres} emphasize />
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={t('taxService.a11yContinueAssignment')}
          style={buttonStyles.primary}
          onPress={() => navigation.navigate('ItemAssignment')}
        >
          <Text style={buttonStyles.primaryText}>{t('common.continue')}</Text>
        </Pressable>
        <Pressable accessibilityLabel={t('taxService.a11yBackToExtracted')} style={buttonStyles.secondary} onPress={handleBack}>
          <Text style={buttonStyles.secondaryText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function PreviewLine({
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
