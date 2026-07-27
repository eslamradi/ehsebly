import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { QuantityStepper } from '../components/QuantityStepper';
import {
  areAllItemsAssigned,
  calculatePersonSubtotals,
  calculatePersonTotals,
} from '../domain/assignment';
import { formatPiastresAsEGP } from '../domain/money';
import { calculateSplitTotals, calculateSubtotalPiastres } from '../domain/splitCalculation';
import { useSplitSession } from '../domain/session';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ItemAssignment'>;

/**
 * Assigns each item to one or more people from an ad-hoc roster (Story 1.5
 * AC #1-#3), and shows a live per-person running total (AC #4) via
 * `calculatePersonSubtotals`/`calculatePersonTotals`. A quantity-1 item (the
 * common case) gets plain tap-to-toggle chips — a weight of 1 each on a
 * shared item reproduces the original even split (AC #2), and there's
 * nothing to count so a stepper would just be a wasted tap. A multi-quantity
 * item (e.g. 10 waters) gets a stepper per person instead, since "how many
 * did you have" is a real question there and can be split unevenly.
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
          gap: spacing.sm,
          ...theme.cardShadow,
        },
        itemHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
        itemName: { flex: 1, minWidth: 0, fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.ink },
        itemPrice: { flexShrink: 0, fontSize: 16, color: colors.ink },
        personAllocationList: { gap: spacing.sm },
        personAllocationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        personAllocationName: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.ink },
        // Single-unit items (the common case — most receipt lines aren't
        // multi-quantity) get plain tap-to-toggle chips instead of a
        // stepper — there's nothing to count, so a counter would just be
        // one extra tap for no benefit. Quantity > 1 items still get the
        // stepper since "how many did you have" is a real question there.
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        chip: {
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radii.pill,
          paddingVertical: 8,
          paddingHorizontal: spacing.lg,
        },
        chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
        chipText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.ink },
        chipTextActive: { color: colors.accentInk },
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

  const { session, addPerson, setItemAllocations } = useSplitSession();
  const { extractionResult, taxService, people, itemAssignments } = session;

  const [newPersonName, setNewPersonName] = useState('');
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [addPersonError, setAddPersonError] = useState<string | null>(null);

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
        <Pressable accessibilityLabel="Back to tax and service" style={buttonStyles.primary} onPress={handleBack}>
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

  const handleContinue = () => {
    if (people.length === 0) {
      setBlockedMessage('Add at least one person before continuing.');
      return;
    }
    if (!areAllItemsAssigned(items.length, itemAssignments)) {
      setBlockedMessage('Assign every item to at least one person before continuing — unassigned items are flagged below.');
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
        <Pressable accessibilityLabel="Add person" style={styles.addButton} onPress={handleAddPerson}>
          <Text style={buttonStyles.primaryText}>Add</Text>
        </Pressable>
      </View>
      {addPersonError && <Text style={styles.errorText}>{addPersonError}</Text>}

      {items.map((item, itemIndex) => {
        const weights = itemAssignments[itemIndex] ?? {};
        const isUnassigned = !Object.values(weights).some((weight) => weight > 0);
        return (
          <View key={itemIndex} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>
                {item.name}
                {item.quantity > 1 ? ` ×${item.quantity}` : ''}
              </Text>
              <Text style={[styles.itemPrice, screenStyles.mono]}>{formatPiastresAsEGP(item.pricePiastres)} EGP</Text>
            </View>
            {people.length === 0 ? (
              <Text style={styles.note}>Add a person above to assign this item.</Text>
            ) : item.quantity === 1 ? (
              <View style={styles.chipRow}>
                {people.map((person, personIndex) => {
                  const active = (weights[personIndex] ?? 0) > 0;
                  return (
                    <Pressable
                      key={personIndex}
                      accessibilityLabel={`Assign ${item.name} to ${person.name}`}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setWeightForPerson(itemIndex, personIndex, active ? 0 : 1)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{person.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.personAllocationList}>
                {people.map((person, personIndex) => (
                  <View key={personIndex} style={styles.personAllocationRow}>
                    <Text style={styles.personAllocationName}>{person.name}</Text>
                    <QuantityStepper
                      accessibilityLabel={`${item.name} units for ${person.name}`}
                      value={weights[personIndex] ?? 0}
                      min={0}
                      max={item.quantity}
                      onChange={(next) => setWeightForPerson(itemIndex, personIndex, next)}
                    />
                  </View>
                ))}
              </View>
            )}
            {isUnassigned && <Text style={styles.errorText}>Unassigned</Text>}
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
        <Pressable accessibilityLabel="Continue to review" style={buttonStyles.primary} onPress={handleContinue}>
          <Text style={buttonStyles.primaryText}>Continue</Text>
        </Pressable>
        <Pressable accessibilityLabel="Back to tax and service" style={buttonStyles.secondary} onPress={handleBack}>
          <Text style={buttonStyles.secondaryText}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
