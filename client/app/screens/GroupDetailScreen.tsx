import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getGroup, listGroupExpenses } from '../api/groupApi';
import { useAccount } from '../domain/account';
import { useSplitSession } from '../domain/session';
import type { Group, GroupMember } from '../domain/group';
import { computeGroupNetBalances, type GroupExpense, type GroupSettlement } from '../domain/groupLedger';
import { formatPiastresAsEGP } from '../domain/money';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupDetail'>;

export default function GroupDetailScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const theme = useTheme();
  const { screenStyles, buttonStyles } = theme;
  const styles = StyleSheet.create({
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    backButton: {
      backgroundColor: theme.colors.paperRaised,
      borderWidth: 1,
      borderColor: theme.colors.line,
      paddingVertical: 10,
      paddingHorizontal: spacing.lg,
      borderRadius: radii.sm,
    },
    balanceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      ...theme.cardShadow,
    },
    memberName: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: theme.colors.ink },
    balancePositive: { fontFamily: fonts.monoSemiBold, fontSize: 15, color: theme.colors.positive },
    balanceNegative: { fontFamily: fonts.monoSemiBold, fontSize: 15, color: theme.colors.critical },
    balanceZero: { fontFamily: fonts.monoRegular, fontSize: 15, color: theme.colors.inkSoft },
    sectionHeading: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: theme.colors.ink, marginTop: spacing.md },
    expenseRow: {
      backgroundColor: theme.colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: 2,
      ...theme.cardShadow,
    },
    expenseHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    expenseDescription: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: theme.colors.ink },
    expenseAmount: { fontFamily: fonts.monoSemiBold, fontSize: 15, color: theme.colors.ink },
    expenseMeta: { fontFamily: fonts.sansRegular, fontSize: 13, color: theme.colors.inkSoft },
    emptyState: { fontFamily: fonts.sansRegular, fontSize: 14, color: theme.colors.inkSoft },
    errorText: { fontFamily: fonts.sansRegular, fontSize: 13, color: theme.colors.critical },
    actions: { gap: spacing.md },
  });

  const { token } = useAccount();
  const { beginGroupExpense } = useSplitSession();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [settlements, setSettlements] = useState<GroupSettlement[]>([]);
  const [logExpenseMessage, setLogExpenseMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!token) {
        return;
      }
      (async () => {
        const [groupResult, expensesResult] = await Promise.all([getGroup(token, groupId), listGroupExpenses(token, groupId)]);
        if (cancelled) {
          return;
        }
        if (groupResult.status === 'ok') {
          setGroup(groupResult.data.group);
          setMembers(groupResult.data.members);
        }
        if (expensesResult.status === 'ok') {
          setExpenses(expensesResult.data.expenses);
          setSettlements(expensesResult.data.settlements);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [token, groupId]),
  );

  const handleLogExpense = (openGalleryOnMount: boolean) => {
    if (members.length === 0) {
      // Reachable while the initial members fetch is still in flight, or if
      // it failed — surface why the button did nothing instead of a silent
      // no-op (Story 2.4 code review, 2026-07-30).
      setLogExpenseMessage("Still loading this group's members — try again in a moment.");
      return;
    }
    setLogExpenseMessage(null);
    beginGroupExpense(
      groupId,
      members.map((member) => ({ id: member.id, displayName: member.displayName })),
    );
    navigation.navigate('Capture', openGalleryOnMount ? { openGalleryOnMount: true } : undefined);
  };

  const netBalances = computeGroupNetBalances(expenses, settlements, members);

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <View style={styles.headerRow}>
        <Text style={screenStyles.heading}>{group?.name ?? 'Group'}</Text>
        <Pressable accessibilityLabel="Back to groups" style={styles.backButton} onPress={() => navigation.navigate('GroupList')}>
          <Text style={buttonStyles.secondaryText}>Back</Text>
        </Pressable>
      </View>

      {members.map((member) => {
        const balance = netBalances[member.id] ?? 0;
        const balanceStyle = balance > 0 ? styles.balancePositive : balance < 0 ? styles.balanceNegative : styles.balanceZero;
        const label =
          balance === 0
            ? 'Settled up'
            : balance > 0
              ? `Owed ${formatPiastresAsEGP(balance)} EGP`
              : `Owes ${formatPiastresAsEGP(-balance)} EGP`;
        return (
          <View key={member.id} style={styles.balanceRow}>
            <Text style={styles.memberName}>
              {member.displayName}
              {member.status === 'pending' ? ' (pending)' : ''}
            </Text>
            <Text style={balanceStyle}>{label}</Text>
          </View>
        );
      })}

      <Text style={styles.sectionHeading}>Expenses</Text>
      {expenses.length === 0 ? (
        <Text style={styles.emptyState}>No expenses logged yet.</Text>
      ) : (
        [...expenses]
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
          .map((expense) => {
            const payer = members.find((member) => member.id === expense.paidByMemberId);
            const payerLabel = payer ? payer.displayName : 'Unknown';
            const dateLabel = expense.createdAt ? new Date(expense.createdAt).toLocaleDateString() : '';
            return (
              <Pressable
                key={expense.id}
                accessibilityLabel={`View ${expense.description || 'expense breakdown'}`}
                style={styles.expenseRow}
                onPress={() => navigation.navigate('ExpenseDetail', { groupId, expenseId: expense.id })}
              >
                <View style={styles.expenseHeaderRow}>
                  <Text style={styles.expenseDescription}>{expense.description || 'Expense breakdown'}</Text>
                  <Text style={styles.expenseAmount}>{formatPiastresAsEGP(expense.totalPiastres)} EGP</Text>
                </View>
                <Text style={styles.expenseMeta}>
                  Paid by {payerLabel}
                  {dateLabel ? ` · ${dateLabel}` : ''}
                </Text>
              </Pressable>
            );
          })
      )}

      {logExpenseMessage && <Text style={styles.errorText}>{logExpenseMessage}</Text>}

      <View style={styles.actions}>
        <Pressable accessibilityLabel="Log an expense with the camera" style={buttonStyles.primary} onPress={() => handleLogExpense(false)}>
          <Text style={buttonStyles.primaryText}>Log Expense</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Log an expense from your gallery"
          style={buttonStyles.secondary}
          onPress={() => handleLogExpense(true)}
        >
          <Text style={buttonStyles.secondaryText}>Log Expense from Gallery</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Invite a member"
          style={buttonStyles.secondary}
          onPress={() => navigation.navigate('InviteMember', { groupId })}
        >
          <Text style={buttonStyles.secondaryText}>Invite Member</Text>
        </Pressable>
        <Pressable accessibilityLabel="Settle up" style={buttonStyles.secondary} onPress={() => navigation.navigate('SettleUp', { groupId })}>
          <Text style={buttonStyles.secondaryText}>Settle Up</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
