import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { QuantityStepper } from '../components/QuantityStepper';
import { formatPiastresAsEGP, parseEGPToPiastres } from '../domain/money';
import { calculateSubtotalPiastres, calculateSplitTotals } from '../domain/splitCalculation';
import { ChargesLedger, type ChargesLedgerHandle } from '../components/ChargesLedger';
import { useSplitSession } from '../domain/session';
import { fonts, radii, spacing, useTheme, textAlignEnd } from '../theme';
import { useI18n } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ExtractedItems'>;

/**
 * "Check the receipt" — the single confirmation step between the photo and
 * assignment. Items are an editable list (Story 1.2 AC #3, not
 * auto-committed) and the charges ledger sits directly beneath them.
 *
 * Items and charges were two screens until the flow consolidation of
 * 2026-08-09. They were split because each was too tall to share a screen;
 * compressing both (one row per item, and fusing the rate editors into the
 * totals panel they duplicated) is what made one screen fit. They belong
 * together because they answer one question — does this match the paper? —
 * and answering it used to cost a screen transition in the middle.
 */
export default function ExtractedItemsScreen({ navigation }: Props) {
  const theme = useTheme();
  const { buttonStyles, screenStyles } = theme;
  const { t } = useI18n();
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
        // The stepper used to occupy a permanent second row on every card —
        // ~44pt each, rendered thirty times on a grocery receipt to serve the
        // handful of lines that aren't quantity 1. It's now behind this badge,
        // which shows the count and opens the stepper when tapped.
        quantityBadge: {
          minWidth: 44,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.sm,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: theme.colors.line,
        },
        quantityBadgeActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft },
        quantityBadgeText: { fontFamily: theme.fonts.monoRegular, fontSize: 13, color: theme.colors.inkFaint },
        quantityBadgeTextActive: { color: theme.colors.accent },
        quantityLabel: { fontFamily: theme.fonts.sansRegular, fontSize: 14, color: theme.colors.inkSoft },
        nameInput: {
          flex: 1,
          minWidth: 0,
          borderWidth: 1,
          borderColor: theme.colors.line,
          borderRadius: radii.sm,
          paddingVertical: 10,
          paddingHorizontal: spacing.md,
          fontFamily: theme.fonts.sansRegular,
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
          textAlign: textAlignEnd,
          fontFamily: theme.fonts.monoRegular,
          color: theme.colors.ink,
        },
        inputError: { borderColor: theme.colors.critical },
        errorText: { fontFamily: theme.fonts.sansRegular, color: theme.colors.critical, fontSize: 12 },
        note: { fontFamily: theme.fonts.sansRegular, fontSize: 14, color: theme.colors.inkSoft },
        mismatchBanner: {
          backgroundColor: theme.colors.paperRaised,
          borderWidth: 1,
          borderColor: theme.colors.critical,
          borderRadius: radii.md,
          padding: spacing.lg,
          gap: spacing.xs,
        },
        mismatchBannerTitle: { fontFamily: theme.fonts.sansSemiBold, fontSize: 14, color: theme.colors.critical },
        mismatchBannerText: { fontFamily: theme.fonts.sansRegular, fontSize: 13, color: theme.colors.critical },
        addItemRow: { flexDirection: 'row', gap: spacing.md },
        addButton: {
          backgroundColor: theme.colors.accent,
          paddingVertical: 10,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.sm,
          justifyContent: 'center',
        },
        photoStrip: { gap: spacing.sm, paddingVertical: spacing.xs },
        photoThumb: { width: 64, height: 84, borderRadius: radii.sm, backgroundColor: theme.colors.paperRaised },
        actions: { gap: spacing.md },
      }),
    [theme],
  );

  const { session, clearPhoto, setExtractionResult, setTaxService } = useSplitSession();
  const result = session.extractionResult;
  const { taxService } = session;

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
  // One stepper open at a time, so a long list can't be pushed around by
  // several expanded rows at once (same rule as the assignment screen's
  // amounts panel).
  const [openQuantityIndex, setOpenQuantityIndex] = useState<number | null>(null);
  // The charges ledger owns its own drafts and error flags; this is how
  // Continue makes it commit them before we navigate.
  const ledgerRef = useRef<ChargesLedgerHandle>(null);

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
        <Text style={screenStyles.message}>{t('extracted.noExtractedItems')}</Text>
        <Pressable accessibilityLabel={t('extracted.a11yBackToCamera')} style={buttonStyles.primary} onPress={handleBackToCamera}>
          <Text style={buttonStyles.primaryText}>{t('extracted.backToCamera')}</Text>
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
  // the charges ledger's subtotal always reflects the latest typed prices,
  // rather than relying solely on blur having already fired (code review
  // finding, Story 1.3).
  const flushAllPriceDrafts = () => {
    Object.keys(priceDrafts).forEach((key) => commitPriceDraft(Number(key)));
  };

  const handleAddItem = () => {
    const trimmedName = newItemName.trim();
    if (trimmedName.length === 0) {
      setAddItemError(t('extracted.errNeedName'));
      return;
    }
    const parsedPrice = parseEGPToPiastres(newItemPriceDraft);
    if (parsedPrice === null) {
      setAddItemError(t('extracted.priceUnreadableShort'));
      return;
    }
    const items = [...result.items, { name: trimmedName, pricePiastres: parsedPrice, quantity: 1, shared: true }];
    setExtractionResult({ ...result, items });
    setNewItemName('');
    setNewItemPriceDraft('');
    setAddItemError(null);
  };

  const handleContinue = () => {
    flushAllPriceDrafts();
    // Stay put if a charge field holds an unreadable draft, so the fronter
    // can see the error instead of navigating away in the tick it was raised.
    if (ledgerRef.current && !ledgerRef.current.commitAll()) {
      return;
    }
    navigation.navigate('ItemAssignment');
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>{t('extracted.title')}</Text>
      <Text style={screenStyles.subheading}>{t('extracted.subtitle')}</Text>
      {/* The screen's whole job is comparing this transcript against the
          paper, and until now the paper vanished the moment extraction
          returned. */}
      {session.photoUris.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
          {session.photoUris.map((uri, index) => (
            <Image
              key={uri}
              accessibilityLabel={t('extracted.a11yReceiptPhoto', { index: index + 1 })}
              source={{ uri }}
              style={styles.photoThumb}
            />
          ))}
        </ScrollView>
      )}
      {/* The receipt contradicting itself is worth more prominence than a
          misread price: every number below is built on figures the paper does
          not agree with. */}
      {result.receiptCheck && (
        <View style={styles.mismatchBanner}>
          <Text style={styles.mismatchBannerTitle}>{t('extracted.receiptCheckTitle')}</Text>
          <Text style={styles.mismatchBannerText}>
            {t('extracted.receiptCheckBody', {
              items: formatPiastresAsEGP(result.receiptCheck.itemsSumPiastres),
              subtotal: formatPiastresAsEGP(result.receiptCheck.printedSubtotalPiastres),
              difference: formatPiastresAsEGP(Math.abs(result.receiptCheck.differencePiastres)),
            })}
          </Text>
        </View>
      )}

      {result.imageMismatchWarning && (
        <View style={styles.mismatchBanner}>
          <Text style={styles.mismatchBannerTitle}>{t('extracted.checkYourPhotos')}</Text>
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
              accessibilityLabel={t('extracted.a11yItemName', { index: index + 1 })}
              style={styles.nameInput}
              value={item.name}
              onChangeText={(text) => updateItemName(index, text)}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: openQuantityIndex === index }}
              accessibilityLabel={t('extracted.a11yQuantityToggle', { item: item.name })}
              style={[styles.quantityBadge, item.quantity > 1 && styles.quantityBadgeActive]}
              onPress={() => setOpenQuantityIndex((previous) => (previous === index ? null : index))}
            >
              <Text style={[styles.quantityBadgeText, item.quantity > 1 && styles.quantityBadgeTextActive]}>
                ×{item.quantity}
              </Text>
            </Pressable>
            <TextInput
              accessibilityLabel={t('extracted.a11yItemPrice', { index: index + 1 })}
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
          {openQuantityIndex === index && (
            <View style={styles.quantityRow}>
              <Text style={styles.quantityLabel}>{t('extracted.quantity')}</Text>
              <QuantityStepper
                accessibilityLabel={t('extracted.a11yItemQuantity', { item: item.name })}
                value={item.quantity}
                min={1}
                onChange={(next) => updateItemQuantity(index, next)}
              />
            </View>
          )}
          {priceErrors[index] && (
            <Text style={styles.errorText}>{t('extracted.priceUnreadable')}</Text>
          )}
        </View>
      ))}

      <View style={styles.addItemRow}>
        <TextInput
          accessibilityLabel={t('extracted.a11yNewItemName')}
          style={styles.nameInput}
          placeholder={t('extracted.addItemPlaceholder')}
          placeholderTextColor={theme.colors.inkFaint}
          value={newItemName}
          onChangeText={(text) => {
            setNewItemName(text);
            setAddItemError(null);
          }}
        />
        <TextInput
          accessibilityLabel={t('extracted.a11yNewItemPrice')}
          style={[styles.priceInput, addItemError && styles.inputError]}
          keyboardType="decimal-pad"
          placeholder={t('extracted.pricePlaceholder')}
          placeholderTextColor={theme.colors.inkFaint}
          value={newItemPriceDraft}
          onChangeText={(text) => {
            setNewItemPriceDraft(text);
            setAddItemError(null);
          }}
        />
        <Pressable accessibilityLabel={t('extracted.a11yAddItem')} style={styles.addButton} onPress={handleAddItem}>
          <Text style={buttonStyles.primaryText}>{t('common.add')}</Text>
        </Pressable>
      </View>
      {addItemError && <Text style={styles.errorText}>{addItemError}</Text>}
      <Text style={styles.note}>{t('extracted.addedItemsNote')}</Text>

      {taxService && (
        <ChargesLedger
          ref={ledgerRef}
          taxService={taxService}
          setTaxService={setTaxService}
          subtotalPiastres={calculateSubtotalPiastres(result.items)}
          discountNote={result.discountNote}
        />
      )}

      <View style={styles.actions}>
        <Pressable accessibilityLabel={t('extracted.a11yContinueAssignment')} style={buttonStyles.primary} onPress={handleContinue}>
          <Text style={buttonStyles.primaryText}>{t('common.continue')}</Text>
        </Pressable>
        <Pressable accessibilityLabel={t('extracted.a11yBackToCamera')} style={buttonStyles.secondary} onPress={handleBackToCamera}>
          <Text style={buttonStyles.secondaryText}>{t('extracted.backToCamera')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
