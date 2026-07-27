import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatPiastresAsEGP, parsePercentInput } from '../domain/money';
import { calculateSplitTotals, calculateSubtotalPiastres } from '../domain/splitCalculation';
import { useSplitSession } from '../domain/session';
import { fonts, radii, spacing, useTheme, type Theme } from '../theme';
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
        rateName: { fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.ink },
        rateInputWrapper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        rateInput: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.sm,
          paddingVertical: 8,
          paddingHorizontal: spacing.md,
          fontFamily: fonts.monoRegular,
          color: colors.ink,
        },
        rateInputDisabled: { backgroundColor: colors.paper, color: colors.inkFaint },
        inputError: { borderColor: colors.critical },
        errorText: { fontFamily: fonts.sansRegular, color: colors.critical, fontSize: 12 },
        percentSign: { fontFamily: fonts.sansRegular, fontSize: 16, color: colors.inkSoft },
        previewPanel: {
          backgroundColor: colors.paperRaised,
          borderRadius: radii.md,
          padding: spacing.lg,
          gap: spacing.sm,
          ...theme.cardShadow,
        },
        previewLine: { flexDirection: 'row', justifyContent: 'space-between' },
        previewLabel: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.inkSoft },
        previewValue: { fontSize: 14, color: colors.ink },
        previewLabelEmphasis: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.ink },
        previewValueEmphasis: { fontFamily: fonts.monoBold, fontSize: 16, color: colors.ink },
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
  // Whether the last blur on each field was rejected as unparseable —
  // shown as a brief cue rather than silently reverting with no feedback
  // (code review finding, Story 1.3).
  const [taxRateError, setTaxRateError] = useState(false);
  const [serviceRateError, setServiceRateError] = useState(false);
  const [otherServiceRateError, setOtherServiceRateError] = useState(false);

  if (!extractionResult || extractionResult.status !== 'ok' || !taxService) {
    // Defensive: this screen is only navigated to after ExtractedItemsScreen
    // has populated both, but guard against stale/cleared session state
    // rather than crashing on `extractionResult.items` or `taxService.*`.
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>Nothing to confirm yet.</Text>
        <Pressable
          accessibilityLabel="Back to extracted items"
          style={buttonStyles.primary}
          onPress={() => navigation.navigate('ExtractedItems')}
        >
          <Text style={buttonStyles.primaryText}>Back</Text>
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
    if (!taxCommitted || !serviceCommitted || !otherServiceCommitted) {
      // Stay put so the fronter can see and fix the error text instead of
      // navigating away in the same tick it was raised (code review finding,
      // Story 1.5 review of this screen).
      return;
    }
    navigation.navigate('ExtractedItems');
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>Tax &amp; Service</Text>

      <View style={styles.rateCard}>
        <View style={styles.rateLabel}>
          <Text style={styles.rateName}>Tax</Text>
          <Switch
            accessibilityLabel="Tax applies to this receipt"
            value={taxService.taxEnabled}
            onValueChange={handleTaxToggle}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.paperRaised}
          />
        </View>
        <View style={styles.rateInputWrapper}>
          <TextInput
            accessibilityLabel="Tax rate percent"
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
        {taxRateError && <Text style={styles.errorText}>Couldn&apos;t read that rate — kept the previous value.</Text>}
      </View>

      <View style={styles.rateCard}>
        <View style={styles.rateLabel}>
          <Text style={styles.rateName}>Service</Text>
          <Switch
            accessibilityLabel="Service applies to this receipt"
            value={taxService.serviceEnabled}
            onValueChange={handleServiceToggle}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.paperRaised}
          />
        </View>
        <View style={styles.rateInputWrapper}>
          <TextInput
            accessibilityLabel="Service rate percent"
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
        {serviceRateError && <Text style={styles.errorText}>Couldn&apos;t read that rate — kept the previous value.</Text>}
      </View>

      <View style={styles.rateCard}>
        <View style={styles.rateLabel}>
          <Text style={styles.rateName}>Other service</Text>
          <Switch
            accessibilityLabel="Other service applies to this receipt"
            value={taxService.otherServiceEnabled}
            onValueChange={handleOtherServiceToggle}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.paperRaised}
          />
        </View>
        <View style={styles.rateInputWrapper}>
          <TextInput
            accessibilityLabel="Other service rate percent"
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
          <Text style={styles.errorText}>Couldn&apos;t read that rate — kept the previous value.</Text>
        )}
      </View>

      <View style={styles.previewPanel}>
        <PreviewLine styles={styles} label="Subtotal" piastres={totals.subtotalPiastres} />
        <PreviewLine styles={styles} label="Service" piastres={totals.servicePiastres} />
        <PreviewLine
          styles={styles}
          label={`Other service${taxService.otherServiceEnabled ? ` (${taxService.otherServiceRatePercent}%)` : ' (off)'}`}
          piastres={totals.otherServicePiastres}
        />
        <PreviewLine styles={styles} label="Tax" piastres={totals.taxPiastres} />
        <PreviewLine styles={styles} label="Total" piastres={totals.totalPiastres} emphasize />
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Continue to item assignment"
          style={buttonStyles.primary}
          onPress={() => navigation.navigate('ItemAssignment')}
        >
          <Text style={buttonStyles.primaryText}>Continue</Text>
        </Pressable>
        <Pressable accessibilityLabel="Back to extracted items" style={buttonStyles.secondary} onPress={handleBack}>
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
