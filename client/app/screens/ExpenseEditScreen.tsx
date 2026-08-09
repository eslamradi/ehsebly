import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { QuantityStepper } from '../components/QuantityStepper';
import { getGroup, listGroupExpenses, updateGroupExpense } from '../api/groupApi';
import { useAccount } from '../domain/account';
import type { GroupMember } from '../domain/group';
import { formatPiastresAsEGP, parseEGPToPiastres, parsePercentInput } from '../domain/money';
import { calculateSplitTotals } from '../domain/splitCalculation';
import type { SubmitExpenseBody } from '../api/groupTypes';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ExpenseEdit'>;

type EditableItem = {
  name: string;
  priceText: string;
  quantity: number;
  isShared: boolean;
  // memberId -> weight, same shape/semantics as domain/groupLedger.ts's
  // GroupExpense.itemAssignments but per-item instead of index-keyed, so
  // adding/removing an item can't desync assignment indices.
  assignments: Record<string, number>;
};

/**
 * Admin-only (2026-07-30) — reached only via ExpenseDetailScreen's Edit
 * button, itself only shown when the signed-in account is the group's
 * creator. The server independently re-checks this (requireGroupAdmin) —
 * this screen's own gating is a UX nicety, not the real enforcement.
 *
 * Deliberately simpler than ChargesLedger/ItemAssignmentScreen's
 * draft-then-commit-on-blur pattern: those exist because session.tsx is
 * shared global state multiple screens touch across an async flow. This
 * screen's whole draft lives in one local `items` array with no other
 * screen reading it mid-edit, so plain controlled inputs validated once at
 * Save time are enough — no stale-closure risk to guard against.
 */
export default function ExpenseEditScreen({ navigation, route }: Props) {
  const { groupId, expenseId } = route.params;
  const theme = useTheme();
  const { colors, buttonStyles, screenStyles } = theme;
  const styles = StyleSheet.create({
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    backButton: {
      backgroundColor: colors.paperRaised,
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.sm,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: radii.sm,
      paddingVertical: 12,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.paperRaised,
      fontFamily: fonts.sansRegular,
      fontSize: 16,
      color: colors.ink,
    },
    itemCard: {
      backgroundColor: colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.sm,
      ...theme.cardShadow,
    },
    itemRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    nameInput: { flex: 1, minWidth: 0 },
    priceInput: { width: 100 },
    removeButton: {
      width: 32,
      height: 32,
      borderRadius: radii.sm,
      backgroundColor: colors.critical,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeButtonText: { fontFamily: fonts.sansBold, color: colors.accentInk, fontSize: 16 },
    quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    label: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.inkSoft },
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
    rateCard: {
      backgroundColor: colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.sm,
      ...theme.cardShadow,
    },
    rateLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rateName: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.ink },
    rateInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rateInput: { flex: 1 },
    rateInputDisabled: { backgroundColor: colors.paper, color: colors.inkFaint },
    percentSign: { fontFamily: fonts.sansRegular, fontSize: 16, color: colors.inkSoft },
    previewPanel: {
      backgroundColor: colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.sm,
      ...theme.cardShadow,
    },
    previewLine: { flexDirection: 'row', justifyContent: 'space-between' },
    previewLabelEmphasis: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.ink },
    previewValueEmphasis: { fontFamily: fonts.monoBold, fontSize: 16, color: colors.ink },
    errorText: { fontFamily: fonts.sansRegular, color: colors.critical, fontSize: 13 },
    actions: { gap: spacing.md },
  });

  const { token } = useAccount();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [items, setItems] = useState<EditableItem[]>([]);
  const [paidByMemberId, setPaidByMemberId] = useState<string | null>(null);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRateText, setTaxRateText] = useState('0');
  const [serviceEnabled, setServiceEnabled] = useState(false);
  const [serviceRateText, setServiceRateText] = useState('0');
  const [otherServiceEnabled, setOtherServiceEnabled] = useState(false);
  const [otherServiceRateText, setOtherServiceRateText] = useState('0');
  const [printedTotalPiastres, setPrintedTotalPiastres] = useState<number | null>(null);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load once, not on every focus — this is a draft the fronter is
  // actively editing; refetching on refocus would silently clobber
  // in-progress changes.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      return;
    }
    (async () => {
      const [groupResult, expensesResult] = await Promise.all([getGroup(token, groupId), listGroupExpenses(token, groupId)]);
      if (cancelled) {
        return;
      }
      if (groupResult.status !== 'ok') {
        setLoadError(groupResult.message);
        return;
      }
      setMembers(groupResult.data.members);
      if (expensesResult.status !== 'ok') {
        setLoadError(expensesResult.message);
        return;
      }
      const expense = expensesResult.data.expenses.find((candidate) => candidate.id === expenseId);
      if (!expense) {
        setLoadError('This expense no longer exists — it may have been deleted.');
        return;
      }
      setDescription(expense.description ?? '');
      setItems(
        expense.items.map((item, index) => ({
          name: item.name ?? '',
          priceText: formatPiastresAsEGP(item.pricePiastres),
          quantity: item.quantity ?? 1,
          isShared: item.isShared ?? false,
          assignments: { ...(expense.itemAssignments[index] ?? {}) },
        })),
      );
      setPaidByMemberId(expense.paidByMemberId);
      setTaxEnabled(expense.taxEnabled ?? false);
      setTaxRateText(String(expense.taxRatePercent ?? 0));
      setServiceEnabled(expense.serviceEnabled ?? false);
      setServiceRateText(String(expense.serviceRatePercent ?? 0));
      setOtherServiceEnabled(expense.otherServiceEnabled ?? false);
      setOtherServiceRateText(String(expense.otherServiceRatePercent ?? 0));
      setPrintedTotalPiastres(expense.printedTotalPiastres ?? null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, groupId, expenseId]);

  const updateItem = (index: number, patch: Partial<EditableItem>) => {
    setItems((previous) => previous.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const handleAddItem = () => {
    setItems((previous) => [...previous, { name: '', priceText: '', quantity: 1, isShared: false, assignments: {} }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const setItemAssignmentWeight = (index: number, memberId: string, weight: number) => {
    setItems((previous) =>
      previous.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }
        const nextAssignments = { ...item.assignments };
        if (weight <= 0) {
          delete nextAssignments[memberId];
        } else {
          nextAssignments[memberId] = weight;
        }
        return { ...item, assignments: nextAssignments };
      }),
    );
  };

  // Live preview only — Save re-parses everything from scratch rather than
  // trusting this, so a mid-typing unparseable rate just shows 0 here
  // instead of blocking the form.
  const previewSubtotalPiastres = items.reduce((sum, item) => sum + (parseEGPToPiastres(item.priceText) ?? 0), 0);
  const previewTotals = calculateSplitTotals({
    subtotalPiastres: previewSubtotalPiastres,
    // Groups expense editing doesn't support a discount yet — Casual
    // Splitting's discount_line detection doesn't feed into Groups.
    discountEnabled: false,
    discountMode: 'flat',
    discountRatePercent: 0,
    discountFlatPiastres: 0,
    taxEnabled,
    taxRatePercent: parsePercentInput(taxRateText) ?? 0,
    serviceEnabled,
    serviceRatePercent: parsePercentInput(serviceRateText) ?? 0,
    otherServiceEnabled,
    otherServiceRatePercent: parsePercentInput(otherServiceRateText) ?? 0,
  });

  const handleSave = async () => {
    if (!token) {
      setSaveError('Your session expired — go back and sign in again.');
      return;
    }
    if (items.length === 0) {
      setSaveError('Add at least one item.');
      return;
    }
    if (!paidByMemberId) {
      setSaveError('Choose who paid.');
      return;
    }

    const parsedItems: Array<{ name: string; price_piastres: number; quantity: number; is_shared: boolean }> = [];
    for (const item of items) {
      const trimmedName = item.name.trim();
      if (trimmedName.length === 0) {
        setSaveError('Every item needs a name.');
        return;
      }
      const pricePiastres = parseEGPToPiastres(item.priceText);
      if (pricePiastres === null) {
        setSaveError(`Couldn't read the price for "${trimmedName}".`);
        return;
      }
      if (!Object.values(item.assignments).some((weight) => weight > 0)) {
        setSaveError(`Assign "${trimmedName}" to at least one person.`);
        return;
      }
      parsedItems.push({ name: trimmedName, price_piastres: pricePiastres, quantity: item.quantity, is_shared: item.isShared });
    }

    const taxRatePercent = parsePercentInput(taxRateText);
    if (taxEnabled && taxRatePercent === null) {
      setSaveError("Couldn't read the tax rate.");
      return;
    }
    const serviceRatePercent = parsePercentInput(serviceRateText);
    if (serviceEnabled && serviceRatePercent === null) {
      setSaveError("Couldn't read the service rate.");
      return;
    }
    const otherServiceRatePercent = parsePercentInput(otherServiceRateText);
    if (otherServiceEnabled && otherServiceRatePercent === null) {
      setSaveError("Couldn't read the other service rate.");
      return;
    }

    const subtotalPiastres = parsedItems.reduce((sum, item) => sum + item.price_piastres, 0);
    const totals = calculateSplitTotals({
      subtotalPiastres,
      discountEnabled: false,
      discountMode: 'flat',
      discountRatePercent: 0,
      discountFlatPiastres: 0,
      taxEnabled,
      taxRatePercent: taxRatePercent ?? 0,
      serviceEnabled,
      serviceRatePercent: serviceRatePercent ?? 0,
      otherServiceEnabled,
      otherServiceRatePercent: otherServiceRatePercent ?? 0,
    });

    const itemAssignments: Record<number, Record<string, number>> = {};
    items.forEach((item, index) => {
      itemAssignments[index] = item.assignments;
    });

    const body: SubmitExpenseBody = {
      description: description.trim(),
      paid_by_member_id: paidByMemberId,
      subtotal_piastres: totals.subtotalPiastres,
      tax_piastres: totals.taxPiastres,
      service_piastres: totals.servicePiastres,
      other_service_piastres: totals.otherServicePiastres,
      total_piastres: totals.totalPiastres,
      printed_total_piastres: printedTotalPiastres,
      tax_enabled: taxEnabled,
      tax_rate_percent: taxRatePercent ?? 0,
      service_enabled: serviceEnabled,
      service_rate_percent: serviceRatePercent ?? 0,
      other_service_enabled: otherServiceEnabled,
      other_service_rate_percent: otherServiceRatePercent ?? 0,
      items: parsedItems,
      item_assignments: itemAssignments,
    };

    setIsSaving(true);
    setSaveError(null);
    const result = await updateGroupExpense(token, groupId, expenseId, body);
    setIsSaving(false);
    if (result.status !== 'ok') {
      setSaveError(result.message);
      return;
    }
    navigation.navigate('ExpenseDetail', { groupId, expenseId });
  };

  if (loadError) {
    return (
      <View style={screenStyles.center}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable
          accessibilityLabel="Back to expense"
          style={buttonStyles.primary}
          onPress={() => navigation.navigate('ExpenseDetail', { groupId, expenseId })}
        >
          <Text style={buttonStyles.primaryText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.subheading}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <View style={styles.headerRow}>
        <Text style={screenStyles.heading}>Edit Expense</Text>
        <Pressable
          accessibilityLabel="Cancel"
          style={styles.backButton}
          onPress={() => navigation.navigate('ExpenseDetail', { groupId, expenseId })}
        >
          <Text style={buttonStyles.secondaryText}>Cancel</Text>
        </Pressable>
      </View>

      <TextInput
        accessibilityLabel="Expense description"
        style={styles.input}
        placeholder="Description"
        placeholderTextColor={colors.inkFaint}
        value={description}
        onChangeText={setDescription}
      />

      <Text style={styles.label}>Who paid?</Text>
      <View style={styles.chipRow}>
        {members.map((member) => {
          const active = paidByMemberId === member.id;
          return (
            <Pressable
              key={member.id}
              accessibilityLabel={`${member.displayName} paid`}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setPaidByMemberId(member.id)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{member.displayName}</Text>
            </Pressable>
          );
        })}
      </View>

      {items.map((item, index) => (
        <View key={index} style={styles.itemCard}>
          <View style={styles.itemRow}>
            <TextInput
              accessibilityLabel={`Item ${index + 1} name`}
              style={[styles.input, styles.nameInput]}
              placeholder="Item name"
              placeholderTextColor={colors.inkFaint}
              value={item.name}
              onChangeText={(text) => updateItem(index, { name: text })}
            />
            <TextInput
              accessibilityLabel={`Item ${index + 1} price`}
              style={[styles.input, styles.priceInput]}
              placeholder="0.00"
              placeholderTextColor={colors.inkFaint}
              keyboardType="decimal-pad"
              value={item.priceText}
              onChangeText={(text) => updateItem(index, { priceText: text })}
            />
            <Pressable accessibilityLabel={`Remove item ${index + 1}`} style={styles.removeButton} onPress={() => handleRemoveItem(index)}>
              <Text style={styles.removeButtonText}>×</Text>
            </Pressable>
          </View>

          <View style={styles.quantityRow}>
            <Text style={styles.label}>Quantity</Text>
            <QuantityStepper
              accessibilityLabel={`Item ${index + 1} quantity`}
              value={item.quantity}
              min={1}
              onChange={(next) => updateItem(index, { quantity: next })}
            />
          </View>

          <Text style={styles.label}>Assigned to</Text>
          <View style={styles.chipRow}>
            {members.map((member) => {
              const active = (item.assignments[member.id] ?? 0) > 0;
              return (
                <Pressable
                  key={member.id}
                  accessibilityLabel={`Assign ${item.name || 'item'} to ${member.displayName}`}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setItemAssignmentWeight(index, member.id, active ? 0 : 1)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{member.displayName}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <Pressable accessibilityLabel="Add item" style={buttonStyles.secondary} onPress={handleAddItem}>
        <Text style={buttonStyles.secondaryText}>Add Item</Text>
      </Pressable>

      <View style={styles.rateCard}>
        <View style={styles.rateLabelRow}>
          <Text style={styles.rateName}>Tax</Text>
          <Switch
            accessibilityLabel="Tax applies"
            value={taxEnabled}
            onValueChange={setTaxEnabled}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.paperRaised}
          />
        </View>
        <View style={styles.rateInputRow}>
          <TextInput
            accessibilityLabel="Tax rate percent"
            style={[styles.input, styles.rateInput, !taxEnabled && styles.rateInputDisabled]}
            keyboardType="decimal-pad"
            editable={taxEnabled}
            value={taxRateText}
            onChangeText={setTaxRateText}
          />
          <Text style={styles.percentSign}>%</Text>
        </View>
      </View>

      <View style={styles.rateCard}>
        <View style={styles.rateLabelRow}>
          <Text style={styles.rateName}>Service</Text>
          <Switch
            accessibilityLabel="Service applies"
            value={serviceEnabled}
            onValueChange={setServiceEnabled}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.paperRaised}
          />
        </View>
        <View style={styles.rateInputRow}>
          <TextInput
            accessibilityLabel="Service rate percent"
            style={[styles.input, styles.rateInput, !serviceEnabled && styles.rateInputDisabled]}
            keyboardType="decimal-pad"
            editable={serviceEnabled}
            value={serviceRateText}
            onChangeText={setServiceRateText}
          />
          <Text style={styles.percentSign}>%</Text>
        </View>
      </View>

      <View style={styles.rateCard}>
        <View style={styles.rateLabelRow}>
          <Text style={styles.rateName}>Other service</Text>
          <Switch
            accessibilityLabel="Other service applies"
            value={otherServiceEnabled}
            onValueChange={setOtherServiceEnabled}
            trackColor={{ false: colors.line, true: colors.accent }}
            thumbColor={colors.paperRaised}
          />
        </View>
        <View style={styles.rateInputRow}>
          <TextInput
            accessibilityLabel="Other service rate percent"
            style={[styles.input, styles.rateInput, !otherServiceEnabled && styles.rateInputDisabled]}
            keyboardType="decimal-pad"
            editable={otherServiceEnabled}
            value={otherServiceRateText}
            onChangeText={setOtherServiceRateText}
          />
          <Text style={styles.percentSign}>%</Text>
        </View>
      </View>

      <View style={styles.previewPanel}>
        <View style={styles.previewLine}>
          <Text style={styles.previewLabelEmphasis}>Total</Text>
          <Text style={styles.previewValueEmphasis}>{formatPiastresAsEGP(previewTotals.totalPiastres)} EGP</Text>
        </View>
      </View>

      {saveError && <Text style={styles.errorText}>{saveError}</Text>}

      <View style={styles.actions}>
        <Pressable accessibilityLabel="Save expense" style={[buttonStyles.primary, isSaving && buttonStyles.disabled]} disabled={isSaving} onPress={handleSave}>
          <Text style={buttonStyles.primaryText}>{isSaving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
