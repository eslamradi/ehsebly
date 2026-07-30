import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getGroup, listGroupExpenses, recordSettlement } from '../api/groupApi';
import { useAccount } from '../domain/account';
import type { GroupMember } from '../domain/group';
import { computeGroupPairwiseDebts, type GroupExpense, type GroupSettlement } from '../domain/groupLedger';
import { formatPiastresAsEGP } from '../domain/money';
import { fonts, radii, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'SettleUp'>;

type DebtRow = { fromMemberId: string; toMemberId: string; amountPiastres: number };

export default function SettleUpScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const theme = useTheme();
  const { screenStyles, buttonStyles } = theme;
  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.colors.paperRaised,
      borderRadius: radii.md,
      padding: spacing.lg,
      gap: spacing.md,
      ...theme.cardShadow,
    },
    rowText: { fontFamily: fonts.sansRegular, fontSize: 15, color: theme.colors.ink, flex: 1 },
    settleButton: {
      backgroundColor: theme.colors.accent,
      paddingVertical: 8,
      paddingHorizontal: spacing.md,
      borderRadius: radii.sm,
    },
    settleButtonText: { fontFamily: fonts.sansSemiBold, color: theme.colors.accentInk, fontSize: 13 },
    errorText: { fontFamily: fonts.sansRegular, color: theme.colors.critical, fontSize: 13 },
  });

  const { token, account } = useAccount();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [settlements, setSettlements] = useState<GroupSettlement[]>([]);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const settlingRef = useRef<string | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // `cancelled` guards against a stale in-flight response overwriting state
  // after the screen loses focus/unmounts mid-fetch (code review finding,
  // Story 2.6, 2026-07-30) — every setState below is gated on it.
  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      if (!token) {
        return;
      }
      setIsLoading(true);
      setLoadError(null);
      const [groupResult, expensesResult] = await Promise.all([getGroup(token, groupId), listGroupExpenses(token, groupId)]);
      if (cancelledRef.current) {
        return;
      }
      let firstError: string | null = null;
      if (groupResult.status === 'ok') {
        setMembers(groupResult.data.members);
      } else {
        firstError = groupResult.message;
      }
      if (expensesResult.status === 'ok') {
        setExpenses(expensesResult.data.expenses);
        setSettlements(expensesResult.data.settlements);
      } else {
        firstError = firstError ?? expensesResult.message;
      }
      setLoadError(firstError);
      setIsLoading(false);
    },
    [token, groupId],
  );

  useFocusEffect(
    useCallback(() => {
      const cancelledRef = { current: false };
      load(cancelledRef);
      return () => {
        cancelledRef.current = true;
      };
    }, [load]),
  );

  const myMember = members.find((member) => member.userId === account?.userId);
  const debts = computeGroupPairwiseDebts(expenses, settlements, members);
  const nameOf = (memberId: string) => members.find((member) => member.id === memberId)?.displayName ?? 'Someone';

  const rows: DebtRow[] = [];
  if (myMember) {
    const iOwe = debts[myMember.id] ?? {};
    for (const [toMemberId, amount] of Object.entries(iOwe)) {
      if (amount > 0) {
        rows.push({ fromMemberId: myMember.id, toMemberId, amountPiastres: amount });
      }
    }
    for (const [fromMemberId, owedToOthers] of Object.entries(debts)) {
      const owedToMe = owedToOthers[myMember.id];
      if (owedToMe && owedToMe > 0) {
        rows.push({ fromMemberId, toMemberId: myMember.id, amountPiastres: owedToMe });
      }
    }
  }

  const handleSettle = async (row: DebtRow) => {
    if (!token) {
      return;
    }
    const rowId = `${row.fromMemberId}-${row.toMemberId}`;
    // `settlingRef` (not just the `settlingId` state) guards against a
    // double-tap firing twice before the disabled-button re-render commits —
    // the state closure inside this handler is stale until the next render,
    // but the ref is checked synchronously on every call (code review
    // finding, Story 2.6, 2026-07-30).
    if (settlingRef.current !== null) {
      return;
    }
    settlingRef.current = rowId;
    setSettlingId(rowId);
    setSettleError(null);
    try {
      // Settle amount is always exactly `row.amountPiastres`, the
      // currently-displayed debt — there is no free-amount input on this
      // screen, so overpayment isn't reachable through this UI (see
      // routes/settlements.ts's recordSettlementRoute for the server-side
      // note on why balance-recomputation isn't added there either).
      const result = await recordSettlement(token, groupId, row.fromMemberId, row.toMemberId, row.amountPiastres);
      if (result.status !== 'ok') {
        // A failed settlement (network error, or an authorization/validation
        // rejection) must not be treated as silent success — the fronter
        // needs to know the debt is NOT actually settled (code review
        // finding, Story 2.6, 2026-07-30).
        setSettleError(result.message);
        return;
      }
      await load({ current: false });
    } finally {
      settlingRef.current = null;
      setSettlingId(null);
    }
  };

  return (
    <ScrollView style={screenStyles.container} contentContainerStyle={screenStyles.content}>
      <Text style={screenStyles.heading}>Settle Up</Text>

      {isLoading && <Text style={screenStyles.subheading}>Loading…</Text>}
      {!isLoading && loadError && <Text style={styles.errorText}>{loadError}</Text>}
      {settleError && <Text style={styles.errorText}>{settleError}</Text>}

      {!isLoading && !loadError && myMember && rows.length === 0 && <Text style={screenStyles.subheading}>Everyone's settled up.</Text>}

      {!isLoading && rows.map((row) => {
        const rowId = `${row.fromMemberId}-${row.toMemberId}`;
        const isMe = row.fromMemberId === myMember?.id;
        return (
          <View key={rowId} style={styles.row}>
            <Text style={styles.rowText}>
              {isMe ? 'You owe ' : `${nameOf(row.fromMemberId)} owes you `}
              <Text style={screenStyles.mono}>{formatPiastresAsEGP(row.amountPiastres)} EGP</Text>
              {isMe ? ` to ${nameOf(row.toMemberId)}` : ''}
            </Text>
            <Pressable
              accessibilityLabel={`Mark settled between ${nameOf(row.fromMemberId)} and ${nameOf(row.toMemberId)}`}
              style={styles.settleButton}
              onPress={() => handleSettle(row)}
              disabled={settlingId === rowId}
            >
              <Text style={styles.settleButtonText}>{settlingId === rowId ? '...' : 'Settle'}</Text>
            </Pressable>
          </View>
        );
      })}

      <Pressable accessibilityLabel="Back" style={buttonStyles.secondary} onPress={() => navigation.goBack()}>
        <Text style={buttonStyles.secondaryText}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}
