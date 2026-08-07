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
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemAssignment'>;

// A person's weight is a *share*, not a unit count (see splitItemAmongWeights),
// so bounding it by the item's quantity would be meaningless — and worse, it
// taught the reading that the number means "how many of the 10 were mine",
// which is exactly the misconception this screen was redesigned to kill. The
// only cap left is a fat-finger guard.
const MAX_WEIGHT_PER_PERSON = 99;

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
          fontFamily: fonts.sansRegular,
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
        itemCardUnassigned: { borderLeftWidth: 3, borderLeftColor: colors.critical },
        itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
        itemHeaderText: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        itemName: { flexShrink: 1, fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.ink },
        quantityBadge: { fontFamily: fonts.monoRegular, fontSize: 13, color: colors.inkSoft },
        itemPrice: { flexShrink: 0, fontSize: 16, color: colors.ink },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        helperRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
        helperText: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.inkSoft },
        helperMoney: { fontFamily: fonts.monoRegular, fontSize: 13, color: colors.inkSoft },
        helperSeparator: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.inkFaint },
        // "Set amounts" stays rendered (muted) even before anyone is assigned:
        // it is the entire discoverability budget for uneven allocation, and
        // hiding it until assignment is how that capability gets lost.
        setAmountsButton: { paddingVertical: spacing.xs, paddingRight: spacing.sm },
        setAmountsText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accent },
        setAmountsTextDisabled: { color: colors.inkFaint },
        amountsPanel: {
          backgroundColor: colors.paper,
          borderRadius: radii.sm,
          padding: spacing.md,
          gap: spacing.sm,
        },
        amountsPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        amountsPanelTitle: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.ink },
        amountsDoneText: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.accent },
        allocationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
        allocationName: { flex: 1, minWidth: 0, fontFamily: fonts.sansRegular, fontSize: 14, color: colors.ink },
        // The live per-person figure is what makes "shares, not units" legible
        // without a word of explanation — set 3 and 3 on a ×10 and you see
        // 15.00 / 15.00 immediately, rather than discovering it at the end.
        allocationShare: { minWidth: 62, textAlign: 'right', fontFamily: fonts.monoRegular, fontSize: 14, color: colors.inkSoft },
        reconcileText: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.inkSoft },
        note: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.inkSoft },
        errorText: { fontFamily: fonts.sansRegular, color: colors.critical, fontSize: 12 },
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
        actions: { gap: spacing.md },
      }),
    [theme],
  );

  const { session, addPerson, setItemAllocations, setPaidByMemberId } = useSplitSession();
  const { extractionResult, taxService, people, itemAssignments, group } = session;

  const [newPersonName, setNewPersonName] = useState('');
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [addPersonError, setAddPersonError] = useState<string | null>(null);
  // At most one amounts panel is open at a time — two open panels on a long
  // receipt make the scroll position jump unpredictably as they expand.
  const [openAmountsItemIndex, setOpenAmountsItemIndex] = useState<number | null>(null);

  const handleBack = () => {
    navigation.navigate('TaxService');
  };

  if (!extractionResult || extractionResult.status !== 'ok' || !taxService) {
    // Defensive: this screen is only reached once extraction and tax/service
    // confirmation have both succeeded, but guard against stale/cleared
    // session state rather than crashing on `extractionResult.items`.
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>Nothing to assign yet.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to tax and service" style={buttonStyles.primary} onPress={handleBack}>
          <Text style={buttonStyles.primaryText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const items = extractionResult.items;

  const handleAddPerson = () => {
    const trimmed = newPersonName.trim();
    if (trimmed.length === 0) {
      setAddPersonError('Enter a name before adding.');
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
      setBlockedMessage('Add at least one person before continuing.');
      return;
    }
    if (!areAllItemsAssigned(items.length, itemAssignments)) {
      setBlockedMessage('Assign every item to at least one person before continuing — unassigned items are flagged below.');
      return;
    }
    if (group && !group.paidByMemberId) {
      setBlockedMessage('Choose who paid before continuing.');
      return;
    }
    setBlockedMessage(null);
    navigation.navigate('Review');
  };

  const subtotalPiastres = calculateSubtotalPiastres(items);
  const totals = calculateSplitTotals({ subtotalPiastres, ...taxService });
  const personSubtotals = calculatePersonSubtotals(items, itemAssignments, people.length);
  const personTotals = calculatePersonTotals(personSubtotals, totals);

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>Who had what?</Text>

      {group ? (
        // Group expenses assign items among the group's actual members only —
        // an ad-hoc "Add a person" here would have no corresponding
        // group_member_id, so their assigned items would silently vanish from
        // the submitted ledger (Story 2.4 code-review finding, 2026-07-29).
        // Membership changes go through Invite Member (Story 2.3), not here.
        <Text style={styles.note}>
          Assigning items among this group's members. To include someone new, invite them from the group screen, then start
          this expense again.
        </Text>
      ) : (
        <>
          <View style={styles.addPersonRow}>
            <TextInput
              accessibilityLabel="New person's name"
              style={styles.nameInput}
              placeholder="Add a person"
              placeholderTextColor={colors.inkFaint}
              value={newPersonName}
              onChangeText={(text) => {
                setNewPersonName(text);
                setAddPersonError(null);
              }}
              onSubmitEditing={handleAddPerson}
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Add person" style={styles.addButton} onPress={handleAddPerson}>
              <Text style={buttonStyles.primaryText}>Add</Text>
            </Pressable>
          </View>
          {addPersonError && <Text style={styles.errorText}>{addPersonError}</Text>}
        </>
      )}

      {group && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.note}>Who paid?</Text>
          <View style={styles.chipRow}>
            {people.map((person, personIndex) => {
              const memberId = group.memberIdByPersonIndex[personIndex];
              const selected = memberId !== undefined && group.paidByMemberId === memberId;
              return (
                <PersonChip
                  key={personIndex}
                  label={person.name}
                  selected={selected}
                  accessibilityLabel={`${person.name} paid`}
                  onPress={() => memberId && setPaidByMemberId(memberId)}
                />
              );
            })}
          </View>
        </View>
      )}

      {items.map((item, itemIndex) => {
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
            ? `${sharesAreEqual ? '' : '≈'}${formatPiastresAsEGP(shareValues[0])} each`
            : null;

        let reconcileLabel: string | null = null;
        if (assignedIndices.length >= 2) {
          const weightSum = assignedIndices.reduce((sum, personIndex) => sum + weights[personIndex], 0);
          if (!uneven) {
            reconcileLabel = 'Shared evenly.';
          } else if (weightSum === item.quantity) {
            reconcileLabel = `All ${item.quantity} counted.`;
          } else if (weightSum < item.quantity) {
            reconcileLabel = `${weightSum} of ${item.quantity} counted — the rest follow the same amounts.`;
          } else {
            reconcileLabel = `${weightSum} counted, receipt shows ${item.quantity} — amounts follow these numbers.`;
          }
        }

        return (
          <View key={itemIndex} style={[styles.itemCard, isUnassigned && styles.itemCardUnassigned]}>
            <View style={styles.itemHeader}>
              <View style={styles.itemHeaderText}>
                <Text style={styles.itemName}>{item.name}</Text>
                {isMultiQuantity && <Text style={styles.quantityBadge}>×{item.quantity}</Text>}
              </View>
              <Text style={[styles.itemPrice, screenStyles.mono]}>{formatPiastresAsEGP(item.pricePiastres)} EGP</Text>
            </View>

            {isUnassigned && people.length > 0 && (
              <View style={theme.pillStyle('critical')}>
                <Text style={theme.pillTextStyle('critical')}>Unassigned</Text>
              </View>
            )}

            {people.length === 0 ? (
              <Text style={styles.note}>Add a person above to assign this item.</Text>
            ) : (
              <>
                <View style={styles.chipRow}>
                  {people.length > 1 && (
                    <PersonChip
                      variant="everyone"
                      label="Everyone"
                      selected={everyoneSelected}
                      accessibilityLabel={
                        everyoneSelected ? `Remove everyone from ${item.name}` : `Assign ${item.name} to everyone`
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
                        accessibilityLabel={`Assign ${item.name} to ${person.name}`}
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
                        accessibilityLabel={`Set per-person amounts for ${item.name}`}
                        disabled={isUnassigned}
                        style={styles.setAmountsButton}
                        onPress={() => setOpenAmountsItemIndex(amountsOpen ? null : itemIndex)}
                      >
                        <Text style={[styles.setAmountsText, isUnassigned && styles.setAmountsTextDisabled]}>
                          {amountsOpen ? 'Hide amounts' : 'Set amounts'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {isMultiQuantity && amountsOpen && !isUnassigned && (
                  <View style={styles.amountsPanel}>
                    <View style={styles.amountsPanelHeader}>
                      <Text style={styles.amountsPanelTitle}>How many each?</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Done setting amounts for ${item.name}`}
                        onPress={() => setOpenAmountsItemIndex(null)}
                      >
                        <Text style={styles.amountsDoneText}>Done</Text>
                      </Pressable>
                    </View>
                    {assignedIndices.map((personIndex) => (
                      <View key={personIndex} style={styles.allocationRow}>
                        <Text style={styles.allocationName} numberOfLines={1}>
                          {people[personIndex].name}
                        </Text>
                        <QuantityStepper
                          accessibilityLabel={`${item.name} share for ${people[personIndex].name}`}
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

      {people.length > 0 && (
        <View style={styles.previewPanel}>
          {people.map((person, personIndex) => (
            <View key={personIndex} style={styles.previewLine}>
              <Text style={styles.previewLabel}>{person.name}</Text>
              <Text style={[styles.previewValue, screenStyles.mono]}>{formatPiastresAsEGP(personTotals[personIndex])} EGP</Text>
            </View>
          ))}
        </View>
      )}

      {blockedMessage && <Text style={styles.errorText}>{blockedMessage}</Text>}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Continue to review" style={buttonStyles.primary} onPress={handleContinue}>
          <Text style={buttonStyles.primaryText}>Continue</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to tax and service" style={buttonStyles.secondary} onPress={handleBack}>
          <Text style={buttonStyles.secondaryText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
