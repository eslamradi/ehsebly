import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { QuantityStepper } from '../components/QuantityStepper';
import { formatPiastresAsEGP, parseEGPToPiastres } from '../domain/money';
import { computeInitialTaxServiceSettings } from '../domain/splitCalculation';
import { useSplitSession } from '../domain/session';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ExtractedItems'>;

/**
 * Shown once extraction succeeds. Presents the items as an editable list —
 * not auto-committed (Story 1.2 AC #3). The full review-and-reconcile
 * experience (FR-9) is Story 1.6's scope; this screen only needs to make
 * clear the list isn't locked-in yet.
 */
export default function ExtractedItemsScreen({ navigation }: Props) {
  const theme = useTheme();
  const { buttonStyles, screenStyles } = theme;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        itemCard: {
          backgroundColor: theme.colors.paperRaised,
          borderRadius: radii.md,
          padding: spacing.lg,
          gap: spacing.md,
          ...theme.cardShadow,
        },
        itemRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
        quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        quantityLabel: { fontFamily: fonts.sansRegular, fontSize: 14, color: theme.colors.inkSoft },
        nameInput: {
          flex: 1,
          minWidth: 0,
          borderWidth: 1,
          borderColor: theme.colors.line,
          borderRadius: radii.sm,
          paddingVertical: 10,
          paddingHorizontal: spacing.md,
          fontFamily: fonts.sansRegular,
          color: theme.colors.ink,
        },
        priceInput: {
          width: 92,
          flexShrink: 0,
          borderWidth: 1,
          borderColor: theme.colors.line,
          borderRadius: radii.sm,
          paddingVertical: 10,
          paddingHorizontal: spacing.md,
          textAlign: 'right',
          fontFamily: fonts.monoRegular,
          color: theme.colors.ink,
        },
        inputError: { borderColor: theme.colors.critical },
        errorText: { fontFamily: fonts.sansRegular, color: theme.colors.critical, fontSize: 12 },
        note: { fontFamily: fonts.sansRegular, fontSize: 14, color: theme.colors.inkSoft },
        mismatchBanner: {
          backgroundColor: theme.colors.paperRaised,
          borderWidth: 1,
          borderColor: theme.colors.critical,
          borderRadius: radii.md,
          padding: spacing.lg,
          gap: spacing.xs,
        },
        mismatchBannerTitle: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: theme.colors.critical },
        mismatchBannerText: { fontFamily: fonts.sansRegular, fontSize: 13, color: theme.colors.critical },
        addItemRow: { flexDirection: 'row', gap: spacing.md },
        addButton: {
          backgroundColor: theme.colors.accent,
          paddingVertical: 10,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.sm,
          justifyContent: 'center',
        },
        actions: { gap: spacing.md },
      }),
    [theme],
  );

  const { session, clearPhoto, setExtractionResult, setTaxService } = useSplitSession();
  const result = session.extractionResult;

  // Draft text per row index, only while that row's price field has focus.
  // Committing (parsing + writing to session) happens on blur, not on
  // every keystroke — otherwise the controlled input reformats to "0.00"
  // mid-typing the moment the field is cleared to retype (code review
  // finding, Story 1.2).
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  // Which rows currently have a rejected (unparseable) draft — shown as a
  // brief visual/text cue so an invalid edit doesn't just silently vanish
  // on blur (code review finding, Story 1.3).
  const [priceErrors, setPriceErrors] = useState<Record<number, boolean>>({});

  // New-item form (delivery fee or any other charge OCR didn't find as its
  // own line) — a single flat, quantity-1 item, flagged `shared` so
  // ItemAssignmentScreen auto-assigns it to everyone rather than requiring
  // the fronter to tap it in for each person like something they ordered.
  const [newItemName, setNewItemName] = useState('');
  const [newItemPriceDraft, setNewItemPriceDraft] = useState('');
  const [addItemError, setAddItemError] = useState<string | null>(null);

  const handleBackToCamera = () => {
    clearPhoto();
    navigation.navigate('Capture');
  };

  if (!result || result.status !== 'ok') {
    // Defensive: navigation only reaches this screen after a successful
    // extraction, but guard against a stale/cleared session rather than
    // crashing on `result.items`.
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>No extracted items to show.</Text>
        <Pressable accessibilityLabel="Back to camera" style={buttonStyles.primary} onPress={handleBackToCamera}>
          <Text style={buttonStyles.primaryText}>Back to Camera</Text>
        </Pressable>
      </View>
    );
  }

  const updateItemName = (index: number, name: string) => {
    const items = result.items.map((item, i) => (i === index ? { ...item, name } : item));
    setExtractionResult({ ...result, items });
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    const items = result.items.map((item, i) => (i === index ? { ...item, quantity } : item));
    setExtractionResult({ ...result, items });
  };

  const commitPriceDraft = (index: number) => {
    const draft = priceDrafts[index];
    if (draft === undefined) {
      return;
    }
    const parsed = parseEGPToPiastres(draft);
    if (parsed !== null) {
      const items = result.items.map((item, i) => (i === index ? { ...item, pricePiastres: parsed } : item));
      setExtractionResult({ ...result, items });
      setPriceErrors((previous) => ({ ...previous, [index]: false }));
    } else {
      // Invalid input is discarded rather than committed — the field
      // reverts to the last valid price below — but flag it rather than
      // silently reverting with no feedback (code review finding).
      setPriceErrors((previous) => ({ ...previous, [index]: true }));
    }
    setPriceDrafts((previous) => {
      const next = { ...previous };
      delete next[index];
      return next;
    });
  };

  // Commits every row still mid-edit. Called before navigating away so
  // TaxServiceScreen's subtotal always reflects the latest typed prices,
  // rather than relying solely on blur having already fired (code review
  // finding, Story 1.3).
  const flushAllPriceDrafts = () => {
    Object.keys(priceDrafts).forEach((key) => commitPriceDraft(Number(key)));
  };

  const handleAddItem = () => {
    const trimmedName = newItemName.trim();
    if (trimmedName.length === 0) {
      setAddItemError('Enter a name before adding.');
      return;
    }
    const parsedPrice = parseEGPToPiastres(newItemPriceDraft);
    if (parsedPrice === null) {
      setAddItemError("Couldn't read that price.");
      return;
    }
    const items = [...result.items, { name: trimmedName, pricePiastres: parsedPrice, quantity: 1, shared: true }];
    setExtractionResult({ ...result, items });
    setNewItemName('');
    setNewItemPriceDraft('');
    setAddItemError(null);
  };

  const rateNote = describeDetectedRates(result.taxRatePercent, result.serviceRatePercent);

  const handleContinue = () => {
    flushAllPriceDrafts();
    // Only seed tax/service defaults the first time — if the fronter has
    // already confirmed/edited them and came back here (e.g. to fix an
    // item price), tapping Continue again must not wipe those edits back
    // to the extraction-detected defaults.
    if (!session.taxService) {
      setTaxService(computeInitialTaxServiceSettings(result));
    }
    navigation.navigate('TaxService');
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>Extracted items</Text>
      <Text style={screenStyles.subheading}>Tap any name or price to fix an OCR misread.</Text>
      {result.imageMismatchWarning && (
        <View style={styles.mismatchBanner}>
          <Text style={styles.mismatchBannerTitle}>Check your photos</Text>
          <Text style={styles.mismatchBannerText}>
            {result.imageMismatchWarning} Only one order was extracted — retake if you meant to include more than one
            receipt.
          </Text>
        </View>
      )}
      {result.items.map((item, index) => (
        <View key={index} style={styles.itemCard}>
          <View style={styles.itemRow}>
            <TextInput
              accessibilityLabel={`Item ${index + 1} name`}
              style={styles.nameInput}
              value={item.name}
              onChangeText={(text) => updateItemName(index, text)}
            />
            <TextInput
              accessibilityLabel={`Item ${index + 1} price in Egyptian pounds`}
              style={[styles.priceInput, priceErrors[index] && styles.inputError]}
              keyboardType="decimal-pad"
              value={priceDrafts[index] ?? formatPiastresAsEGP(item.pricePiastres)}
              onChangeText={(text) => {
                setPriceDrafts((previous) => ({ ...previous, [index]: text }));
                setPriceErrors((previous) => ({ ...previous, [index]: false }));
              }}
              onBlur={() => commitPriceDraft(index)}
            />
          </View>
          <View style={styles.quantityRow}>
            <Text style={styles.quantityLabel}>Quantity</Text>
            <QuantityStepper
              accessibilityLabel={`${item.name} quantity`}
              value={item.quantity}
              min={1}
              onChange={(next) => updateItemQuantity(index, next)}
            />
          </View>
          {priceErrors[index] && (
            <Text style={styles.errorText}>Couldn&apos;t read that price — kept the previous value.</Text>
          )}
        </View>
      ))}

      <View style={styles.addItemRow}>
        <TextInput
          accessibilityLabel="New item name"
          style={styles.nameInput}
          placeholder="Delivery, etc."
          placeholderTextColor={theme.colors.inkFaint}
          value={newItemName}
          onChangeText={(text) => {
            setNewItemName(text);
            setAddItemError(null);
          }}
        />
        <TextInput
          accessibilityLabel="New item price in Egyptian pounds"
          style={[styles.priceInput, addItemError && styles.inputError]}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={theme.colors.inkFaint}
          value={newItemPriceDraft}
          onChangeText={(text) => {
            setNewItemPriceDraft(text);
            setAddItemError(null);
          }}
        />
        <Pressable accessibilityLabel="Add item" style={styles.addButton} onPress={handleAddItem}>
          <Text style={buttonStyles.primaryText}>Add</Text>
        </Pressable>
      </View>
      {addItemError && <Text style={styles.errorText}>{addItemError}</Text>}
      <Text style={styles.note}>Added items (like a delivery fee) are split equally among everyone.</Text>

      {rateNote && <Text style={styles.note}>{rateNote}</Text>}
      <View style={styles.actions}>
        <Pressable accessibilityLabel="Continue to tax and service" style={buttonStyles.primary} onPress={handleContinue}>
          <Text style={buttonStyles.primaryText}>Continue</Text>
        </Pressable>
        <Pressable accessibilityLabel="Back to camera" style={buttonStyles.secondary} onPress={handleBackToCamera}>
          <Text style={buttonStyles.secondaryText}>Back to Camera</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function describeDetectedRates(
  taxRatePercent: number | undefined,
  serviceRatePercent: number | undefined,
): string | null {
  if (taxRatePercent === undefined && serviceRatePercent === undefined) {
    return null;
  }
  const parts: string[] = [];
  if (taxRatePercent !== undefined) {
    parts.push(`${taxRatePercent}% tax`);
  }
  if (serviceRatePercent !== undefined) {
    parts.push(`${serviceRatePercent}% service`);
  }
  return `Detected ${parts.join(' and ')} on the receipt — you'll confirm this next.`;
}
