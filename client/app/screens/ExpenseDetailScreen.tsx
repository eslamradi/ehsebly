import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { deleteGroupExpense, getGroup, listGroupExpenses } from '../api/groupApi';
import { useAccount } from '../domain/account';
import type { Group, GroupMember } from '../domain/group';
import { calculateMemberSharesForExpense, resolveMembersForLedger, type GroupExpense } from '../domain/groupLedger';
import { formatPiastresAsEGP } from '../domain/money';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ExpenseDetail'>;

/**
 * "Admin" has no dedicated role (2026-07-30 decision) — the group's
 * creator is its one, permanent admin, mirroring authMiddleware.ts's
 * requireGroupAdmin server-side. Only the admin sees Edit/Delete; the
 * server independently re-enforces this regardless of what this screen
 * shows or hides.
 */
export default function ExpenseDetailScreen({ navigation, route }: Props) {
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
    metaText: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.inkSoft },
    sectionHeading: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.ink, marginTop: spacing.sm },
    splitPanel: {
      backgroundColor: colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.sm,
      ...theme.cardShadow,
    },
    splitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    splitName: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.ink },
    splitPaidPill: { fontFamily: fonts.sansRegular, fontSize: 12, color: colors.positive },
    splitAmount: { fontFamily: fonts.monoSemiBold, fontSize: 15, color: colors.ink },
    itemCard: {
      backgroundColor: colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: 4,
      ...theme.cardShadow,
    },
    itemHeaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
    itemName: { flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15, color: colors.ink },
    itemPrice: { fontFamily: fonts.monoRegular, fontSize: 15, color: colors.ink },
    itemAssignees: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.inkSoft },
    previewPanel: {
      backgroundColor: colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.sm,
      ...theme.cardShadow,
    },
    previewLine: { flexDirection: 'row', justifyContent: 'space-between' },
    previewLabel: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.inkSoft },
    previewValue: { fontFamily: fonts.monoRegular, fontSize: 14, color: colors.ink },
    previewLabelEmphasis: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.ink },
    previewValueEmphasis: { fontFamily: fonts.monoBold, fontSize: 16, color: colors.ink },
    errorText: { fontFamily: fonts.sansRegular, color: colors.critical, fontSize: 13 },
    actions: { gap: spacing.md },
    deleteButton: { backgroundColor: colors.critical, paddingVertical: 16, borderRadius: radii.md, alignItems: 'center' },
    deleteButtonText: { fontFamily: fonts.sansBold, color: colors.accentInk, fontSize: 15 },
  });

  const { token, account } = useAccount();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expense, setExpense] = useState<GroupExpense | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!token) {
        return;
      }
      setConfirmingDelete(false);
      (async () => {
        const [groupResult, expensesResult] = await Promise.all([getGroup(token, groupId), listGroupExpenses(token, groupId)]);
        if (cancelled) {
          return;
        }
        if (groupResult.status === 'ok') {
          setGroup(groupResult.data.group);
          setMembers(groupResult.data.members);
        } else {
          setLoadError(groupResult.message);
        }
        if (expensesResult.status === 'ok') {
          const found = expensesResult.data.expenses.find((candidate) => candidate.id === expenseId) ?? null;
          setExpense(found);
          if (!found) {
            setLoadError('This expense no longer exists — it may have been deleted.');
          }
        } else {
          setLoadError(expensesResult.message);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [token, groupId, expenseId]),
  );

  const isAdmin = Boolean(group && account && group.createdByUserId === account.userId);

  const handleDelete = async () => {
    if (!token) {
      setDeleteError('Your session expired — go back and sign in again.');
      return;
    }
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deleteGroupExpense(token, groupId, expenseId);
    setIsDeleting(false);
    if (result.status !== 'ok') {
      setDeleteError(result.message);
      setConfirmingDelete(false);
      return;
    }
    navigation.navigate('GroupDetail', { groupId });
  };

  if (loadError && !expense) {
    return (
      <View style={screenStyles.center}>
        <Text style={styles.errorText}>{loadError}</Text>
        <Pressable accessibilityLabel="Back to group" style={buttonStyles.primary} onPress={() => navigation.navigate('GroupDetail', { groupId })}>
          <Text style={buttonStyles.primaryText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!expense) {
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.subheading}>Loading…</Text>
      </View>
    );
  }

  // `members` (getGroup) excludes removed members — backfill anyone this
  // specific expense references but who has since left, so their share
  // doesn't silently vanish/redistribute here the way it used to in the
  // group-wide ledger before Story 2.6's fix (2026-07-30, same root cause).
  const resolvedMembers = resolveMembersForLedger(members, [expense], []);
  const payer = resolvedMembers.find((member) => member.id === expense.paidByMemberId);
  const dateLabel = expense.createdAt ? new Date(expense.createdAt).toLocaleString() : '';
  const memberNameById = new Map(resolvedMembers.map((member) => [member.id, member.displayName]));
  // Who owes what for THIS expense specifically — each member's share
  // (their assigned items' cost plus their proportional tax/service),
  // same math FinalSplitScreen/SettleUp use elsewhere, just scoped to one
  // expense instead of a whole group's running balance.
  const memberShares = calculateMemberSharesForExpense(expense, resolvedMembers);

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <View style={styles.headerRow}>
        <Text style={screenStyles.heading}>{expense.description || 'Expense breakdown'}</Text>
        <Pressable accessibilityLabel="Back to group" style={styles.backButton} onPress={() => navigation.navigate('GroupDetail', { groupId })}>
          <Text style={buttonStyles.secondaryText}>Back</Text>
        </Pressable>
      </View>
      <Text style={styles.metaText}>
        Paid by {payer ? payer.displayName : 'Unknown'}
        {dateLabel ? ` · ${dateLabel}` : ''}
      </Text>

      <Text style={styles.sectionHeading}>Breakdown</Text>
      <View style={styles.splitPanel}>
        {resolvedMembers.map((member) => {
          const share = memberShares[member.id] ?? 0;
          if (share <= 0) {
            return null;
          }
          const isPayer = member.id === expense.paidByMemberId;
          return (
            <View key={member.id} style={styles.splitRow}>
              <Text style={styles.splitName}>
                {member.displayName}
                {isPayer ? <Text style={styles.splitPaidPill}>  paid</Text> : null}
              </Text>
              <Text style={styles.splitAmount}>
                {isPayer ? '' : 'owes '}
                {formatPiastresAsEGP(share)} EGP
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.previewPanel}>
        <View style={styles.previewLine}>
          <Text style={styles.previewLabel}>Subtotal</Text>
          <Text style={styles.previewValue}>{formatPiastresAsEGP(expense.subtotalPiastres)} EGP</Text>
        </View>
        <View style={styles.previewLine}>
          <Text style={styles.previewLabel}>Service</Text>
          <Text style={styles.previewValue}>{formatPiastresAsEGP(expense.servicePiastres)} EGP</Text>
        </View>
        <View style={styles.previewLine}>
          <Text style={styles.previewLabel}>Other service</Text>
          <Text style={styles.previewValue}>{formatPiastresAsEGP(expense.otherServicePiastres)} EGP</Text>
        </View>
        <View style={styles.previewLine}>
          <Text style={styles.previewLabel}>Tax</Text>
          <Text style={styles.previewValue}>{formatPiastresAsEGP(expense.taxPiastres)} EGP</Text>
        </View>
        <View style={styles.previewLine}>
          <Text style={styles.previewLabelEmphasis}>Total</Text>
          <Text style={styles.previewValueEmphasis}>{formatPiastresAsEGP(expense.totalPiastres)} EGP</Text>
        </View>
        {expense.printedTotalPiastres !== null && expense.printedTotalPiastres !== undefined && (
          <View style={styles.previewLine}>
            <Text style={styles.previewLabel}>Printed total</Text>
            <Text style={styles.previewValue}>{formatPiastresAsEGP(expense.printedTotalPiastres)} EGP</Text>
          </View>
        )}
      </View>

      {expense.items.map((item, index) => {
        const weights = expense.itemAssignments[index] ?? {};
        const assigneeNames = Object.entries(weights)
          .filter(([, weight]) => weight > 0)
          .map(([memberId]) => memberNameById.get(memberId) ?? 'Unknown');
        return (
          <View key={item.id ?? index} style={styles.itemCard}>
            <View style={styles.itemHeaderRow}>
              <Text style={styles.itemName}>
                {item.name ?? 'Item'}
                {item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ''}
              </Text>
              <Text style={styles.itemPrice}>{formatPiastresAsEGP(item.pricePiastres)} EGP</Text>
            </View>
            <Text style={styles.itemAssignees}>{assigneeNames.length > 0 ? assigneeNames.join(', ') : 'Unassigned'}</Text>
          </View>
        );
      })}

      {isAdmin && (
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel="Edit expense"
            style={buttonStyles.secondary}
            onPress={() => navigation.navigate('ExpenseEdit', { groupId, expenseId })}
          >
            <Text style={buttonStyles.secondaryText}>Edit</Text>
          </Pressable>
          {deleteError && <Text style={styles.errorText}>{deleteError}</Text>}
          <Pressable
            accessibilityLabel={confirmingDelete ? 'Confirm delete expense' : 'Delete expense'}
            style={[styles.deleteButton, isDeleting && buttonStyles.disabled]}
            disabled={isDeleting}
            onPress={handleDelete}
          >
            <Text style={styles.deleteButtonText}>
              {isDeleting ? 'Deleting…' : confirmingDelete ? 'Tap again to confirm delete' : 'Delete'}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
