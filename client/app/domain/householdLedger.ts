import { calculatePersonSubtotals, calculatePersonTotals } from './assignment';
import type { SplitCalculationResult } from './splitCalculation';
import type { HouseholdMember } from './household';

export type HouseholdExpense = {
  id: string;
  paidByMemberId: string;
  items: Array<{ pricePiastres: number }>;
  // itemIndex -> household_member_id -> weight, the same shape as
  // session.tsx's ItemAssignments but keyed by memberId instead of a
  // person array index.
  itemAssignments: Record<number, Record<string, number>>;
  // Already-computed totals (from calculateSplitTotals at submit time) —
  // stored/transmitted as piastres amounts, not rates, so no rate
  // round-tripping is needed to replay the math here.
  subtotalPiastres: number;
  taxPiastres: number;
  servicePiastres: number;
  otherServicePiastres: number;
  totalPiastres: number;
};

export type HouseholdSettlement = {
  fromMemberId: string;
  toMemberId: string;
  amountPiastres: number;
};

/**
 * Maps memberId-keyed weights onto assignment.ts's index-keyed shape (order
 * fixed by `members`), runs the already-verified weighted-split math
 * (calculatePersonSubtotals/calculatePersonTotals — the exact same functions
 * ItemAssignmentScreen already uses), then maps the per-index shares back to
 * memberId. A household expense costs exactly what the existing solo-split
 * math already proved correct, with no second implementation.
 */
export function calculateMemberSharesForExpense(expense: HouseholdExpense, members: HouseholdMember[]): Record<string, number> {
  const memberIdByIndex = members.map((member) => member.id);
  const indexByMemberId = new Map(memberIdByIndex.map((id, index) => [id, index]));

  const indexedAssignments: Record<number, Record<number, number>> = {};
  for (const [itemIndexText, weights] of Object.entries(expense.itemAssignments)) {
    const itemIndex = Number(itemIndexText);
    const indexedWeights: Record<number, number> = {};
    for (const [memberId, weight] of Object.entries(weights)) {
      const personIndex = indexByMemberId.get(memberId);
      if (personIndex !== undefined) {
        indexedWeights[personIndex] = weight;
      }
    }
    indexedAssignments[itemIndex] = indexedWeights;
  }

  const totals: SplitCalculationResult = {
    subtotalPiastres: expense.subtotalPiastres,
    taxPiastres: expense.taxPiastres,
    servicePiastres: expense.servicePiastres,
    otherServicePiastres: expense.otherServicePiastres,
    totalPiastres: expense.totalPiastres,
  };
  const personSubtotals = calculatePersonSubtotals(expense.items, indexedAssignments, memberIdByIndex.length);
  const personTotals = calculatePersonTotals(personSubtotals, totals);

  const shares: Record<string, number> = {};
  memberIdByIndex.forEach((memberId, index) => {
    shares[memberId] = personTotals[index];
  });
  return shares;
}

/**
 * Running net balance per member across every expense + settlement in a
 * household (positive = owed to them, negative = they owe). For each
 * expense, every member's share debits them and credits the payer — except
 * the payer's own share, which nets to zero (you can't owe yourself).
 * Settlements then move balance directly from payer to recipient.
 * Conservation always holds: the sum of every member's net balance is
 * exactly 0.
 */
export function computeHouseholdNetBalances(
  expenses: HouseholdExpense[],
  settlements: HouseholdSettlement[],
  members: HouseholdMember[],
): Record<string, number> {
  const net: Record<string, number> = {};
  for (const member of members) {
    net[member.id] = 0;
  }

  for (const expense of expenses) {
    const shares = calculateMemberSharesForExpense(expense, members);
    for (const [memberId, share] of Object.entries(shares)) {
      if (memberId === expense.paidByMemberId) {
        continue;
      }
      net[memberId] = (net[memberId] ?? 0) - share;
      net[expense.paidByMemberId] = (net[expense.paidByMemberId] ?? 0) + share;
    }
  }

  for (const settlement of settlements) {
    net[settlement.fromMemberId] = (net[settlement.fromMemberId] ?? 0) + settlement.amountPiastres;
    net[settlement.toMemberId] = (net[settlement.toMemberId] ?? 0) - settlement.amountPiastres;
  }

  return net;
}

/**
 * Per directed-pair breakdown ("you owe Bob X") for SettleUpScreen — same
 * accumulation as computeHouseholdNetBalances but kept per ordered pair
 * instead of collapsed to one net number per member. `debts[a][b]` is what
 * `a` owes `b`. Deliberately not simplified/netted across the two
 * directions of a pair or across three-way cycles (Stage 1 scope) — a
 * smarter "minimum transactions to settle" reduction can be added later as
 * one more pure function here without touching this one.
 */
export function computeHouseholdPairwiseDebts(
  expenses: HouseholdExpense[],
  settlements: HouseholdSettlement[],
  members: HouseholdMember[],
): Record<string, Record<string, number>> {
  const debts: Record<string, Record<string, number>> = {};
  const add = (fromMemberId: string, toMemberId: string, amount: number) => {
    if (fromMemberId === toMemberId || amount === 0) {
      return;
    }
    if (!debts[fromMemberId]) {
      debts[fromMemberId] = {};
    }
    debts[fromMemberId][toMemberId] = (debts[fromMemberId][toMemberId] ?? 0) + amount;
  };

  for (const expense of expenses) {
    const shares = calculateMemberSharesForExpense(expense, members);
    for (const [memberId, share] of Object.entries(shares)) {
      if (memberId !== expense.paidByMemberId) {
        add(memberId, expense.paidByMemberId, share);
      }
    }
  }

  for (const settlement of settlements) {
    // Reduces what fromMember owes toMember — recorded against that same
    // directed pair (not the reverse), so it nets against a prior debt in
    // that direction first.
    add(settlement.fromMemberId, settlement.toMemberId, -settlement.amountPiastres);
  }

  return debts;
}
