import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PersonChip } from '../components/PersonChip';
import { QuantityStepper } from '../components/QuantityStepper';
import {
  areAllItemsAssigned,
  calculatePersonSubtotals,
  calculatePersonTotals,
  hasUnevenWeights,
  splitItemAmongWeights,
} from '../domain/assignment';
import { formatPiastresAsEGP } from '../domain/money';
import { calculateSplitTotals, calculateSubtotalPiastres } from '../domain/splitCalculation';
import { useSplitSession } from '../domain/session';
import { fonts, radii, spacing, textAlignEnd, useTheme, userTextStyle } from '../theme';
import { useI18n } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemAssignment'>;

// A person's weight is a *share*, not a unit count (see splitItemAmongWeights),
// so bounding it by the item's quantity would be meaningless — and worse, it
// taught the reading that the number means "how many of the 10 were mine",
// which is exactly the misconception this screen was redesigned to kill. The
// only cap left is a fat-finger guard.
const MAX_WEIGHT_PER_PERSON = 99;

// Below this the whole list already fits in a screen or two, so a filter would
// be chrome with nothing to hide.
const FILTER_MIN_ITEMS = 8;

/**
 * Assigns each item to one or more people from an ad-hoc roster (Story 1.5
 * AC #1-#3), and shows a live per-person running total (AC #4) via
 * `calculatePersonSubtotals`/`calculatePersonTotals`.
 *
 * One control answers "who had this" for every item regardless of quantity: a
 * row of tap-to-toggle chips. This replaced a split where quantity-1 items got
 * chips but multi-quantity items got a vertical list of `− 0 +` steppers, one
 * row per person whether or not they were involved (UX review, 2026-08-07).
 * That older layout had two problems. Visually, the only signal that someone
 * was on a multi-quantity item was their digit reading 1 instead of 0 — no
 * fill, no colour, nothing scannable. Semantically it was worse: the stepper
 * was capped at the item's quantity and sat beside an "×10" label, so it read
 * as "how many of the 10 were yours", while the underlying math splits by
 * relative weight. Two people setting 3 each on a "Water ×10" were charged
 * 15.00 apiece, not the 9.00 the screen implied.
 *
 * Because weights are relative, equal weights already mean "shared evenly" —
 * so tapping names is a complete and correct answer for a multi-quantity item,
 * not a shortcut. Per-person counts are therefore demoted to an opt-in "Set
 * amounts" panel that only lists people actually on the item, and a chip only
 * shows a number once weights genuinely differ. The panel prints each person's
 * live money share so the shares model is self-evident rather than inferred,
 * and closes with a reconciliation line that states plainly when the counts
 * don't add up to the printed quantity instead of silently absorbing the
 * difference.
 *
 * `session.taxService` is already populated by the time this screen is
 * reached (Story 1.3); this screen adds `session.people` and
 * `session.itemAssignments` on top.
 */
export default function ItemAssignmentScreen({ navigation }: Props) {
  const theme = useTheme();
  const { colors, buttonStyles, screenStyles } = theme;
  const { t } = useI18n();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        addPersonRow: { flexDirection: 'row', gap: spacing.md },
        nameInput: {
          flex: 1,
          minWidth: 0,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.sm,
          paddingVertical: 10,
          paddingHorizontal: spacing.md,
          backgroundColor: colors.paperRaised,
          fontFamily: theme.fonts.sansRegular,
          color: colors.ink,
        },
        addButton: {
          backgroundColor: colors.accent,
          paddingVertical: 10,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.sm,
          justifyContent: 'center',
        },
        itemCard: {
          backgroundColor: colors.paperRaised,
          borderRadius: radii.md,
          padding: spacing.lg,
          gap: spacing.md,
          ...theme.cardShadow,
        },
        // An unassigned card carries a left rail as well as the pill below it:
        // the rail is what makes it findable while scroll-skimming a 30-line
        // grocery receipt, and the pill's text is what keeps the state from
        // being communicated by colour alone.
        itemCardUnassigned: { borderStartWidth: 3, borderStartColor: colors.critical },
        itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
        itemHeaderText: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        itemName: { flexShrink: 1, fontFamily: theme.fonts.sansSemiBold, fontSize: 16, color: colors.ink },
        quantityBadge: { fontFamily: theme.fonts.monoRegular, fontSize: 13, color: colors.inkSoft },
        itemPrice: { flexShrink: 0, fontSize: 16, color: colors.ink },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        helperRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
        helperText: { fontFamily: theme.fonts.sansRegular, fontSize: 13, color: colors.inkSoft },
        helperMoney: { fontFamily: theme.fonts.monoRegular, fontSize: 13, color: colors.inkSoft },
        helperSeparator: { fontFamily: theme.fonts.sansRegular, fontSize: 13, color: colors.inkFaint },
        // "Set amounts" stays rendered (muted) even before anyone is assigned:
        // it is the entire discoverability budget for uneven allocation, and
        // hiding it until assignment is how that capability gets lost.
        setAmountsButton: { paddingVertical: spacing.xs, paddingEnd: spacing.sm },
        setAmountsText: { fontFamily: theme.fonts.sansSemiBold, fontSize: 13, color: colors.accent },
        setAmountsTextDisabled: { color: colors.inkFaint },
        amountsPanel: {
          backgroundColor: colors.paper,
          borderRadius: radii.sm,
          padding: spacing.md,
          gap: spacing.sm,
        },
        amountsPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        amountsPanelTitle: { fontFamily: theme.fonts.sansSemiBold, fontSize: 13, color: colors.ink },
        amountsDoneText: { fontFamily: theme.fonts.sansSemiBold, fontSize: 13, color: colors.accent },
        allocationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        allocationName: { flex: 1, minWidth: 0, fontFamily: theme.fonts.sansRegular, fontSize: 14, color: colors.ink },
        // The live per-person figure is what makes "shares, not units" legible
        // without a word of explanation — set 3 and 3 on a ×10 and you see
        // 15.00 / 15.00 immediately, rather than discovering it at the end.
        allocationShare: { minWidth: 62, textAlign: textAlignEnd, fontFamily: theme.fonts.monoRegular, fontSize: 14, color: colors.inkSoft },
        reconcileText: { fontFamily: theme.fonts.sansRegular, fontSize: 12, color: colors.inkSoft },
        note: { fontFamily: theme.fonts.sansRegular, fontSize: 14, color: colors.inkSoft },
        errorText: { fontFamily: theme.fonts.sansRegular, color: colors.critical, fontSize: 12 },

        // The screen is a scroll region plus a pinned footer rather than one
        // long ScrollView: the running per-person totals used to sit *below*
        // every item card, which on a 30-line receipt put them off-screen for
        // the entire task they exist to support.
        screen: { flex: 1, backgroundColor: colors.paper },
        scrollContent: {
          paddingTop: spacing.xl + theme.insets.top,
          paddingBottom: spacing.xl,
          paddingHorizontal: spacing.xl,
          gap: spacing.lg,
        },
        headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
        backButton: {
          backgroundColor: colors.paperRaised,
          borderWidth: 1,
          borderColor: colors.line,
          paddingVertical: 10,
          paddingHorizontal: spacing.lg,
          borderRadius: radii.sm,
        },
        progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
        progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
        progressLabel: { flexShrink: 0, fontFamily: theme.fonts.sansMedium, fontSize: 13, color: colors.inkSoft },
        filterToggle: {
          flexShrink: 0,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.pill,
          paddingVertical: 6,
          paddingHorizontal: spacing.md,
        },
        filterToggleActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
        filterToggleText: { fontFamily: theme.fonts.sansSemiBold, fontSize: 12, color: colors.inkSoft },
        // Accent-outlined rather than solid: it's a shortcut, not the primary
        // path, and a filled button here would compete with Continue.
        bulkAssignButton: {
          alignSelf: 'flex-start',
          minHeight: 44,
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.accent,
          borderRadius: radii.pill,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
        },
        bulkAssignText: { fontFamily: theme.fonts.sansSemiBold, fontSize: 14, color: colors.accent },
        filterToggleTextActive: { color: colors.accent },
        footer: {
          backgroundColor: colors.paperRaised,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing.md + theme.insets.bottom,
          gap: spacing.md,
        },
        totalsStrip: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
        totalsEntry: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
        totalsName: { fontFamily: theme.fonts.sansRegular, fontSize: 13, color: colors.inkSoft },
        totalsValue: { fontFamily: theme.fonts.monoSemiBold, fontSize: 14, color: colors.ink },
      }),
    [theme, colors],
  );

  const { session, addPerson, setItemAllocations, setAllItemAllocations, setPaidByMemberId } = useSplitSession();
  const { extractionResult, taxService, people, itemAssignments, group } = session;

  const [newPersonName, setNewPersonName] = useState('');
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [addPersonError, setAddPersonError] = useState<string | null>(null);
  // At most one amounts panel is open at a time — two open panels on a long
  // receipt make the scroll position jump unpredictably as they expand.
  const [openAmountsItemIndex, setOpenAmountsItemIndex] = useState<number | null>(null);
  // Narrows the list to the items still needing someone. Offered only on
  // receipts long enough for scrolling to be the actual obstacle, and switched
  // on automatically when Continue is blocked — a far more reliable "take me
  // to the problem" than trying to scroll a specific card into view.
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);

  const handleBack = () => {
    navigation.navigate('ExtractedItems');
  };

  if (!extractionResult || extractionResult.status !== 'ok' || !taxService) {
    // Defensive: this screen is only reached once extraction and tax/service
    // confirmation have both succeeded, but guard against stale/cleared
    // session state rather than crashing on `extractionResult.items`.
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>{t('assignment.nothingToAssign')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('assignment.a11yBackToTax')} style={buttonStyles.primary} onPress={handleBack}>
          <Text style={buttonStyles.primaryText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const items = extractionResult.items;

  const handleAddPerson = () => {
    const trimmed = newPersonName.trim();
    if (trimmed.length === 0) {
      setAddPersonError(t('assignment.errNeedName'));
      return;
    }
    const newPersonIndex = people.length;
    addPerson(trimmed);
    // Hand-added items (delivery fee, etc. — flagged `shared` back on
    // ExtractedItemsScreen) auto-include every new person as they join, so
    // "split equally among everyone" holds throughout the session instead
    // of only for whoever existed when the item was first added.
    items.forEach((item, itemIndex) => {
      if (!item.shared) {
        return;
      }
      const current = itemAssignments[itemIndex] ?? {};
      setItemAllocations(itemIndex, { ...current, [newPersonIndex]: 1 });
    });
    setNewPersonName('');
    setAddPersonError(null);
    setBlockedMessage(null);
  };

  const setWeightForPerson = (itemIndex: number, personIndex: number, nextWeight: number) => {
    const current = itemAssignments[itemIndex] ?? {};
    const next = { ...current, [personIndex]: nextWeight };
    if (nextWeight <= 0) {
      delete next[personIndex];
    }
    setItemAllocations(itemIndex, next);
    setBlockedMessage(null);
  };

  /**
   * The whole-receipt shortcut: everyone on every item, at weight 1 each,
   * which is an even share of every line. Splitting a 30-line grocery run
   * between two flatmates otherwise costs a tap per item, since the Everyone
   * chip only ever covered one line.
   *
   * Offered only while nothing is assigned yet, so it can never overwrite
   * assignments someone has already made by hand — a stray tap after five
   * minutes of careful work would be unrecoverable, and there is no undo.
   * Once the roster has been touched, the per-item chips take over.
   *
   * Deliberately not a default: auto-assigning on arrival would produce
   * plausible-looking wrong bills and would neuter `areAllItemsAssigned`,
   * which is the one gate that forces a human to look at every line.
   */
  const assignEverythingToEveryone = () => {
    const everyone: Record<number, number> = {};
    people.forEach((_person, personIndex) => {
      everyone[personIndex] = 1;
    });
    const next: Record<number, Record<number, number>> = {};
    items.forEach((_item, itemIndex) => {
      next[itemIndex] = { ...everyone };
    });
    setAllItemAllocations(next);
    setBlockedMessage(null);
  };

  /** Select-all / clear-all for one item — a single write, not a per-person loop. */
  const toggleEveryone = (itemIndex: number, allSelected: boolean) => {
    const next: Record<number, number> = {};
    if (!allSelected) {
      people.forEach((_person, personIndex) => {
        next[personIndex] = itemAssignments[itemIndex]?.[personIndex] ?? 1;
      });
    }
    setItemAllocations(itemIndex, next);
    setBlockedMessage(null);
  };

  const handleContinue = () => {
    if (people.length === 0) {
      setBlockedMessage(t('assignment.errNeedPerson'));
      return;
    }
    if (!areAllItemsAssigned(items.length, itemAssignments)) {
      const remaining = items.filter(
        (_item, itemIndex) => !Object.values(itemAssignments[itemIndex] ?? {}).some((weight) => weight > 0),
      ).length;
      if (items.length >= FILTER_MIN_ITEMS) {
        setOnlyUnassigned(true);
        setBlockedMessage(t('assignment.errUnassignedFiltered', { count: remaining }));
      } else {
        setBlockedMessage(t('assignment.errUnassigned', { count: remaining }));
      }
      return;
    }
    if (group && !group.paidByMemberId) {
      setBlockedMessage(t('assignment.errNeedPayer'));
      return;
    }
    setBlockedMessage(null);
    navigation.navigate('FinalSplit');
  };

  const subtotalPiastres = calculateSubtotalPiastres(items);
  const totals = calculateSplitTotals({ subtotalPiastres, ...taxService });
  const personSubtotals = calculatePersonSubtotals(items, itemAssignments, people.length);
  const personTotals = calculatePersonTotals(personSubtotals, totals);

  // Indices are carried alongside the items so filtering the list never
  // desynchronises a card from the `itemAssignments` key it writes to.
  const indexedItems = items.map((item, itemIndex) => ({ item, itemIndex }));
  const unassignedItems = indexedItems.filter(
    ({ itemIndex }) => !Object.values(itemAssignments[itemIndex] ?? {}).some((weight) => weight > 0),
  );
  const assignedCount = items.length - unassignedItems.length;
  const showFilter = items.length >= FILTER_MIN_ITEMS;
  const visibleItems = onlyUnassigned ? unassignedItems : indexedItems;

  return (
    <View style={styles.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerRow}>
        <Text style={screenStyles.heading}>{t('assignment.title')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assignment.a11yBackToTax')}
          style={styles.backButton}
          onPress={handleBack}
        >
          <Text style={buttonStyles.secondaryText}>{t('common.back')}</Text>
        </Pressable>
      </View>

      {/* The row hides once everything is assigned — unless the filter is on,
          which would otherwise strand the user on an empty list with the only
          control that could restore it gone from the screen. */}
      {people.length > 0 && (assignedCount < items.length || onlyUnassigned) && (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(assignedCount / items.length) * 100}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{t('assignment.progress', { assigned: assignedCount, total: items.length })}</Text>
          {showFilter && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: onlyUnassigned }}
              accessibilityLabel={t('assignment.a11yOnlyUnassigned')}
              style={[styles.filterToggle, onlyUnassigned && styles.filterToggleActive]}
              onPress={() => setOnlyUnassigned((previous) => !previous)}
            >
              <Text style={[styles.filterToggleText, onlyUnassigned && styles.filterToggleTextActive]}>{t('assignment.onlyUnassigned')}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Whole-receipt shortcut. Only while the roster is untouched — see
          assignEverythingToEveryone for why it must never overwrite. */}
      {people.length > 1 && assignedCount === 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assignment.a11yEveryoneHadEverything')}
          style={styles.bulkAssignButton}
          onPress={assignEverythingToEveryone}
        >
          <Text style={styles.bulkAssignText}>{t('assignment.everyoneHadEverything')}</Text>
        </Pressable>
      )}

      {group ? (
        // Group expenses assign items among the group's actual members only —
        // an ad-hoc "Add a person" here would have no corresponding
        // group_member_id, so their assigned items would silently vanish from
        // the submitted ledger (Story 2.4 code-review finding, 2026-07-29).
        // Membership changes go through Invite Member (Story 2.3), not here.
        <Text style={styles.note}>{t('assignment.groupNote')}</Text>
      ) : (
        <>
          <View style={styles.addPersonRow}>
            <TextInput
              accessibilityLabel={t('assignment.a11yNewPersonName')}
              style={styles.nameInput}
              placeholder={t('assignment.addPersonPlaceholder')}
              placeholderTextColor={colors.inkFaint}
              value={newPersonName}
              onChangeText={(text) => {
                setNewPersonName(text);
                setAddPersonError(null);
              }}
              onSubmitEditing={handleAddPerson}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={t('assignment.a11yAddPerson')} style={styles.addButton} onPress={handleAddPerson}>
              <Text style={buttonStyles.primaryText}>{t('common.add')}</Text>
            </Pressable>
          </View>
          {addPersonError && <Text style={styles.errorText}>{addPersonError}</Text>}
        </>
      )}

      {group && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.note}>{t('assignment.whoPaid')}</Text>
          <View style={styles.chipRow}>
            {people.map((person, personIndex) => {
              const memberId = group.memberIdByPersonIndex[personIndex];
              const selected = memberId !== undefined && group.paidByMemberId === memberId;
              return (
                <PersonChip
                  key={personIndex}
                  label={person.name}
                  selected={selected}
                  accessibilityLabel={t('assignment.a11yPersonPaid', { person: person.name })}
                  onPress={() => memberId && setPaidByMemberId(memberId)}
                />
              );
            })}
          </View>
        </View>
      )}

      {onlyUnassigned && visibleItems.length === 0 && (
        <Text style={styles.note}>{t('assignment.allAssignedFiltered')}</Text>
      )}

      {visibleItems.map(({ item, itemIndex }) => {
        const weights = itemAssignments[itemIndex] ?? {};
        const assignedIndices = people
          .map((_person, personIndex) => personIndex)
          .filter((personIndex) => (weights[personIndex] ?? 0) > 0);
        const isUnassigned = assignedIndices.length === 0;
        const isMultiQuantity = item.quantity > 1;
        const uneven = hasUnevenWeights(weights);
        const shares = splitItemAmongWeights(item.pricePiastres, weights);
        const everyoneSelected = people.length > 0 && assignedIndices.length === people.length;
        const amountsOpen = openAmountsItemIndex === itemIndex;

        // "X each" is only meaningful once two or more people share the line.
        // Largest-remainder can leave shares a piastre apart, so the figure is
        // marked approximate rather than quietly rounded into a small lie.
        const shareValues = assignedIndices.map((personIndex) => shares[personIndex] ?? 0);
        const sharesAreEqual = shareValues.every((value) => value === shareValues[0]);
        const eachLabel =
          assignedIndices.length >= 2 && !uneven
            ? t(sharesAreEqual ? 'assignment.eachAmount' : 'assignment.eachAmountApprox', {
                amount: formatPiastresAsEGP(shareValues[0]),
              })
            : null;

        let reconcileLabel: string | null = null;
        if (assignedIndices.length >= 2) {
          const weightSum = assignedIndices.reduce((sum, personIndex) => sum + weights[personIndex], 0);
          if (!uneven) {
            reconcileLabel = t('assignment.sharedEvenly');
          } else if (weightSum === item.quantity) {
            reconcileLabel = t('assignment.allCounted', { count: item.quantity });
          } else if (weightSum < item.quantity) {
            reconcileLabel = t('assignment.someCounted', { counted: weightSum, total: item.quantity });
          } else {
            reconcileLabel = t('assignment.overCounted', { counted: weightSum, total: item.quantity });
          }
        }

        return (
          <View key={itemIndex} style={[styles.itemCard, isUnassigned && styles.itemCardUnassigned]}>
            <View style={styles.itemHeader}>
              <View style={styles.itemHeaderText}>
                <Text style={[styles.itemName, userTextStyle(item.name, 'sansSemiBold', theme.fonts)]}>{item.name}</Text>
                {isMultiQuantity && <Text style={styles.quantityBadge}>×{item.quantity}</Text>}
              </View>
              <Text style={[styles.itemPrice, screenStyles.mono]}>{formatPiastresAsEGP(item.pricePiastres)} EGP</Text>
            </View>

            {isUnassigned && people.length > 0 && (
              <View style={theme.pillStyle('critical')}>
                <Text style={theme.pillTextStyle('critical')}>{t('assignment.unassigned')}</Text>
              </View>
            )}

            {people.length === 0 ? (
              <Text style={styles.note}>{t('assignment.addPersonFirst')}</Text>
            ) : (
              <>
                <View style={styles.chipRow}>
                  {people.length > 1 && (
                    <PersonChip
                      variant="everyone"
                      label={t('assignment.everyone')}
                      selected={everyoneSelected}
                      accessibilityLabel={
                        everyoneSelected
                          ? t('assignment.a11yRemoveEveryone', { item: item.name })
                          : t('assignment.a11yAssignEveryone', { item: item.name })
                      }
                      onPress={() => toggleEveryone(itemIndex, everyoneSelected)}
                    />
                  )}
                  {people.map((person, personIndex) => {
                    const weight = weights[personIndex] ?? 0;
                    return (
                      <PersonChip
                        key={personIndex}
                        label={person.name}
                        selected={weight > 0}
                        // Only an uneven split gets numbers — see PersonChip's
                        // `count` docs and `describePersonItems`, which apply
                        // the identical rule to the summary line.
                        count={uneven ? weight : undefined}
                        accessibilityLabel={t('assignment.a11yAssignTo', { item: item.name, person: person.name })}
                        onPress={() => setWeightForPerson(itemIndex, personIndex, weight > 0 ? 0 : 1)}
                      />
                    );
                  })}
                </View>

                {(eachLabel || isMultiQuantity) && (
                  <View style={styles.helperRow}>
                    {eachLabel && <Text style={styles.helperMoney}>{eachLabel}</Text>}
                    {eachLabel && isMultiQuantity && <Text style={styles.helperSeparator}>·</Text>}
                    {isMultiQuantity && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: amountsOpen, disabled: isUnassigned }}
                        accessibilityLabel={t('assignment.a11ySetAmounts', { item: item.name })}
                        disabled={isUnassigned}
                        style={styles.setAmountsButton}
                        onPress={() => setOpenAmountsItemIndex(amountsOpen ? null : itemIndex)}
                      >
                        <Text style={[styles.setAmountsText, isUnassigned && styles.setAmountsTextDisabled]}>
                          {amountsOpen ? t('assignment.hideAmounts') : t('assignment.setAmounts')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {isMultiQuantity && amountsOpen && !isUnassigned && (
                  <View style={styles.amountsPanel}>
                    <View style={styles.amountsPanelHeader}>
                      <Text style={styles.amountsPanelTitle}>{t('assignment.howManyEach')}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('assignment.a11yDoneAmounts', { item: item.name })}
                        onPress={() => setOpenAmountsItemIndex(null)}
                      >
                        <Text style={styles.amountsDoneText}>{t('common.done')}</Text>
                      </Pressable>
                    </View>
                    {assignedIndices.map((personIndex) => (
                      <View key={personIndex} style={styles.allocationRow}>
                        <Text
                          style={[
                            styles.allocationName,
                            userTextStyle(people[personIndex].name, 'sansRegular', theme.fonts),
                          ]}
                          numberOfLines={1}
                        >
                          {people[personIndex].name}
                        </Text>
                        <QuantityStepper
                          accessibilityLabel={t('assignment.a11yShareFor', { item: item.name, person: people[personIndex].name })}
                          value={weights[personIndex] ?? 0}
                          min={0}
                          max={MAX_WEIGHT_PER_PERSON}
                          onChange={(next) => setWeightForPerson(itemIndex, personIndex, next)}
                        />
                        <Text style={styles.allocationShare}>{formatPiastresAsEGP(shares[personIndex] ?? 0)}</Text>
                      </View>
                    ))}
                    {reconcileLabel && <Text style={styles.reconcileText}>{reconcileLabel}</Text>}
                  </View>
                )}
              </>
            )}
          </View>
        );
      })}

      </ScrollView>

      <View style={styles.footer}>
        {/* Lives beside Continue, not at the end of the scroll content — the
            button is pinned, so an explanation left up there would sit
            off-screen exactly when it's needed. */}
        {blockedMessage && <Text style={styles.errorText}>{blockedMessage}</Text>}
        {people.length > 0 && (
          // Scrolls horizontally rather than wrapping: the footer's height has
          // to stay fixed, and a party of eight would otherwise push the
          // Continue button off-screen.
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.totalsStrip}>
            {people.map((person, personIndex) => (
              <View key={personIndex} style={styles.totalsEntry}>
                <Text style={[styles.totalsName, userTextStyle(person.name, 'sansRegular', theme.fonts)]}>{person.name}</Text>
                <Text style={styles.totalsValue}>{formatPiastresAsEGP(personTotals[personIndex])}</Text>
              </View>
            ))}
          </ScrollView>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('assignment.a11yContinueReview')}
          style={buttonStyles.primary}
          onPress={handleContinue}
        >
          <Text style={buttonStyles.primaryText}>{t('common.continue')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
