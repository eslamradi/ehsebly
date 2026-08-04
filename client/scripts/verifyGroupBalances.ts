/**
 * Standalone verification for `client/app/domain/groupLedger.ts` (the
 * household/trip group-splitting ledger — Stage 1 of the group-splitting
 * roadmap). Same shape and rationale as `verifyAssignment.ts` /
 * `verifySplitCalculation.ts` — no test framework exists for this project
 * yet, so this is a plain, re-runnable script against the real production
 * functions.
 *
 * Run with: `npx tsx client/scripts/verifyGroupBalances.ts`.
 */
import {
  calculateMemberSharesForExpense,
  computeGroupNetBalances,
  computeGroupPairwiseDebts,
  type GroupExpense,
  type GroupSettlement,
} from '../app/domain/groupLedger';
import type { GroupMember } from '../app/domain/group';

let checks = 0;
let failures = 0;

function assertEqual(label: string, actual: number, expected: number): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function makeMember(id: string, overrides: Partial<GroupMember> = {}): GroupMember {
  return { id, email: `member${id}@example.com`, displayName: `Member ${id}`, status: 'active', userId: `user-${id}`, ...overrides };
}

// --- calculateMemberSharesForExpense: delegates to assignment.ts's math,
// conserves the total ------------------------------------------------------

function checkCalculateMemberSharesForExpense(): void {
  const members = [makeMember('a'), makeMember('b'), makeMember('c'), makeMember('d')];
  // Same "10 waters" scenario assignment.ts's own verify script uses,
  // re-keyed by memberId instead of person index — 300 piastres total,
  // split 3:1:2:4.
  const expense: GroupExpense = {
    id: 'e1',
    paidByMemberId: 'a',
    items: [{ pricePiastres: 300 }],
    itemAssignments: { 0: { a: 3, b: 1, c: 2, d: 4 } },
    subtotalPiastres: 300,
    taxPiastres: 0,
    servicePiastres: 0,
    otherServicePiastres: 0,
    totalPiastres: 300,
  };
  const shares = calculateMemberSharesForExpense(expense, members);
  assertEqual('10-waters share a (3 units)', shares.a, 90);
  assertEqual('10-waters share b (1 unit)', shares.b, 30);
  assertEqual('10-waters share c (2 units)', shares.c, 60);
  assertEqual('10-waters share d (4 units)', shares.d, 120);
  assertEqual('10-waters shares sum to expense total', sum(Object.values(shares)), 300);
}

// --- computeGroupNetBalances: single expense, even split -----------------

function checkNetBalancesSingleExpenseEvenSplit(): void {
  const members = [makeMember('a'), makeMember('b'), makeMember('c')];
  const expense: GroupExpense = {
    id: 'e1',
    paidByMemberId: 'a',
    items: [{ pricePiastres: 900 }],
    itemAssignments: { 0: { a: 1, b: 1, c: 1 } },
    subtotalPiastres: 900,
    taxPiastres: 0,
    servicePiastres: 0,
    otherServicePiastres: 0,
    totalPiastres: 900,
  };
  const net = computeGroupNetBalances([expense], [], members);
  // a paid 900, owes their own 300 share (nets to zero against themself),
  // is owed 300 from each of b and c -> net +600.
  assertEqual('payer net balance', net.a, 600);
  assertEqual('non-payer b net balance', net.b, -300);
  assertEqual('non-payer c net balance', net.c, -300);
}

// --- computeGroupNetBalances: conservation invariant across many expenses,
// alternating payers, and a settlement -------------------------------------

function checkNetBalancesConservation(): void {
  const members = [makeMember('a'), makeMember('b'), makeMember('c')];
  const expenses: GroupExpense[] = [
    {
      id: 'e1',
      paidByMemberId: 'a',
      items: [{ pricePiastres: 600 }],
      itemAssignments: { 0: { a: 1, b: 1, c: 1 } },
      subtotalPiastres: 600,
      taxPiastres: 0,
      servicePiastres: 0,
      otherServicePiastres: 0,
      totalPiastres: 600,
    },
    {
      id: 'e2',
      paidByMemberId: 'b',
      items: [{ pricePiastres: 1000 }],
      itemAssignments: { 0: { a: 3, b: 2, c: 5 } },
      subtotalPiastres: 1000,
      taxPiastres: 140,
      servicePiastres: 120,
      otherServicePiastres: 0,
      totalPiastres: 1260,
    },
    {
      id: 'e3',
      paidByMemberId: 'c',
      items: [{ pricePiastres: 250 }, { pricePiastres: 75 }],
      itemAssignments: { 0: { a: 1 }, 1: { b: 1, c: 1 } },
      subtotalPiastres: 325,
      taxPiastres: 0,
      servicePiastres: 0,
      otherServicePiastres: 0,
      totalPiastres: 325,
    },
  ];
  const settlements: GroupSettlement[] = [{ fromMemberId: 'a', toMemberId: 'c', amountPiastres: 150 }];

  const net = computeGroupNetBalances(expenses, settlements, members);
  checks++;
  const total = sum(Object.values(net));
  if (total !== 0) {
    failures++;
    console.error(`FAIL: net balances must always sum to 0 — got ${total}`);
  }
}

// --- a settlement of the exact owed amount zeros out that pair ------------

function checkSettlementZerosOutPair(): void {
  const members = [makeMember('a'), makeMember('b')];
  const expense: GroupExpense = {
    id: 'e1',
    paidByMemberId: 'a',
    items: [{ pricePiastres: 1000 }],
    itemAssignments: { 0: { a: 1, b: 1 } },
    subtotalPiastres: 1000,
    taxPiastres: 0,
    servicePiastres: 0,
    otherServicePiastres: 0,
    totalPiastres: 1000,
  };
  const netBefore = computeGroupNetBalances([expense], [], members);
  assertEqual('before settling, b owes a', netBefore.b, -500);

  const settlement: GroupSettlement = { fromMemberId: 'b', toMemberId: 'a', amountPiastres: 500 };
  const netAfter = computeGroupNetBalances([expense], [settlement], members);
  assertEqual('after settling exactly what was owed, a is settled', netAfter.a, 0);
  assertEqual('after settling exactly what was owed, b is settled', netAfter.b, 0);
}

// --- computeGroupPairwiseDebts ---------------------------------------------

function checkPairwiseDebts(): void {
  const members = [makeMember('a'), makeMember('b'), makeMember('c')];
  const expenses: GroupExpense[] = [
    {
      id: 'e1',
      paidByMemberId: 'a',
      items: [{ pricePiastres: 300 }],
      itemAssignments: { 0: { a: 1, b: 1, c: 1 } },
      subtotalPiastres: 300,
      taxPiastres: 0,
      servicePiastres: 0,
      otherServicePiastres: 0,
      totalPiastres: 300,
    },
    {
      id: 'e2',
      paidByMemberId: 'b',
      items: [{ pricePiastres: 300 }],
      itemAssignments: { 0: { a: 1, b: 1, c: 1 } },
      subtotalPiastres: 300,
      taxPiastres: 0,
      servicePiastres: 0,
      otherServicePiastres: 0,
      totalPiastres: 300,
    },
  ];
  const debts = computeGroupPairwiseDebts(expenses, [], members);
  // e1: b and c each owe a 100. e2: a and c each owe b 100.
  assertEqual('b owes a (from e1)', debts.b?.a ?? 0, 100);
  assertEqual('c owes a (from e1)', debts.c?.a ?? 0, 100);
  assertEqual('a owes b (from e2)', debts.a?.b ?? 0, 100);
  assertEqual('c owes b (from e2)', debts.c?.b ?? 0, 100);
  // Deliberately NOT simplified — a's debt to b and b's debt to a (if both
  // existed) would show as two separate directed entries, not one netted
  // value (Stage 1 scope, see groupLedger.ts's own comment).
}

// --- a pending member (no account yet) still accrues a correct balance ----

function checkPendingMemberAccumulatesBalance(): void {
  const members = [makeMember('a'), makeMember('b', { status: 'pending', userId: null })];
  const expense: GroupExpense = {
    id: 'e1',
    paidByMemberId: 'a',
    items: [{ pricePiastres: 400 }],
    itemAssignments: { 0: { a: 1, b: 1 } },
    subtotalPiastres: 400,
    taxPiastres: 0,
    servicePiastres: 0,
    otherServicePiastres: 0,
    totalPiastres: 400,
  };
  const net = computeGroupNetBalances([expense], [], members);
  // Ledger math keys off member.id only — a pending member (no userId yet)
  // holds a real balance exactly like an active one, which is the whole
  // point of inviting-by-email before signup.
  assertEqual('pending member still owes their share', net.b, -200);
}

// --- run everything ------------------------------------------------------

checkCalculateMemberSharesForExpense();
checkNetBalancesSingleExpenseEvenSplit();
checkNetBalancesConservation();
checkSettlementZerosOutPair();
checkPairwiseDebts();
checkPendingMemberAccumulatesBalance();

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${checks} checks passed.`);
  process.exit(0);
}
