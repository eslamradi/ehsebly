# Story 2.6: Settle Up — Net and Pairwise Balances

Status: done

<!-- Retroactive backfill: implementation predates this story doc. See Dev Agent Record. -->

## Story

As a group member,
I want to see who owes whom and how much across the group's logged expenses,
so that we can settle up outside the app (InstaPay, Vodafone Cash, cash) without doing the math ourselves.

## Acceptance Criteria

1. **Given** a group has one or more logged expenses, **when** I open Settle Up, **then** hasebly displays each member's net balance and each pair's net directed debt (FR-17). `[Revised 2026-07-30 — see Review Findings: debt-list minimization to a minimal transaction set deferred to a follow-up story]`
2. **Given** Settle Up is displayed, **when** I view it, **then** no payment is initiated, moved, or deep-linked anywhere — display only (FR-12, FR-17).

## Tasks / Subtasks

- [x] Implement per-expense member share calculation by delegating to the already-proven solo-split math (AC: #1)
  - [x] `calculateMemberSharesForExpense` in `client/app/domain/groupLedger.ts:37-69` maps `GroupExpense.itemAssignments` (memberId-keyed) onto `assignment.ts`'s index-keyed shape, then calls the exact same `calculatePersonSubtotals`/`calculatePersonTotals` functions Epic 1's `ItemAssignmentScreen` uses — no second split-math implementation exists.
- [x] Implement running net balance per member across expenses + settlements (AC: #1)
  - [x] `computeGroupNetBalances` in `groupLedger.ts:80-107` — each expense debits every non-payer their share and credits the payer; each settlement moves balance directly from payer to recipient. Conservation invariant (sum of all net balances == 0) is verified in `verifyGroupBalances.ts`.
- [x] Implement per-directed-pair debt breakdown for display (AC: #1)
  - [x] `computeGroupPairwiseDebts` in `groupLedger.ts:118-151` — same accumulation as net balances, kept per ordered pair (`debts[from][to]`) instead of collapsed. Explicitly **not** simplified across the two directions of a pair or three-way cycles yet (documented as "Stage 1 scope" in the source comment) — see Dev Notes.
- [x] Build `SettleUpScreen` to fetch group/expenses/settlements and render only the signed-in member's owed/owing rows (AC: #1)
  - [x] `client/app/screens/SettleUpScreen.tsx` — loads via `getGroup`/`listGroupExpenses` on focus (`useFocusEffect`), derives `myMember` from `account.userId`, filters `computeGroupPairwiseDebts` output down to rows involving `myMember`.
- [x] Implement "mark settled" action that records a settlement, not a payment (AC: #2)
  - [x] `handleSettle` in `SettleUpScreen.tsx:92-101` calls `recordSettlement` (client/app/api/groupApi.ts) → `POST` handled by `recordSettlementRoute` in `client/backend/worker/src/routes/settlements.ts` → `insertSettlement` in `client/backend/worker/src/db/settlements.ts`, which only writes a `settlements` row. No payment SDK, bank integration, or InstaPay/Vodafone Cash call exists in any of these files (confirmed by direct read — grep of the whole backend for `stripe|paypal|instapay|vodafone|payment` outside comments/strings turns up nothing but the FR-12 doc comments themselves).
- [x] Verify the ledger math against hand-computed expected values (AC: #1)
  - [x] `client/scripts/verifyGroupBalances.ts` — 6 checks: share-splitting against `assignment.ts`'s existing "10 waters" 3:1:2:4 fixture, single-expense even split, multi-expense conservation invariant, exact-settlement zeroing a pair, pairwise-debt accumulation across two expenses with different payers, and a *pending* (no-account-yet) member still accruing a correct balance.

### Review Findings

*Code review, 2026-07-29 — 3 parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) against the diff for `groupLedger.ts`, `SettleUpScreen.tsx`, `routes/settlements.ts`, `db/settlements.ts`, `verifyGroupBalances.ts`.*

**Decision needed:**
- [x] [Review][Decision] *(Resolved 2026-07-30: accept Stage 1, revise AC — no code fix.)* Pairwise debts aren't minimized, and AC #1's "minimal set" claim is only partially true — `computeGroupPairwiseDebts` (`groupLedger.ts:118-151`) never nets opposing directions of the same pair or collapses multi-hop cycles — the code's own comment calls this "Stage 1 scope." Net balances are correct (conserve to zero, verified). AC #1 in this story file and in `epics.md`'s Story 2.6 should be reworded from "the minimal set of pairwise debts" to "each pair's net directed debt" — debt-list minimization is deferred to a follow-up story, not required for `done`.
- [x] [Review][Patch] *(Decision resolved 2026-07-30: cap at displayed debt — IMPLEMENTED.)* Overpaying a settlement beyond the recorded directed debt silently drops the reverse credit. **Fix implemented:** the client already only ever sends `row.amountPiastres` (the exact currently-displayed debt) — there is no free-amount input anywhere in `SettleUpScreen.tsx`, so overpayment isn't reachable through the shipped UI today; documented this explicitly in a code comment on `handleSettle` so a future free-amount input can't be added without also revisiting this. **Server-side note:** deliberately did NOT add balance-recomputation to `recordSettlementRoute` — Architecture AD-2 requires all split/balance calculation to stay client-side, and the backend never receiving/returning split results. Recomputing pairwise debts server-side to cap an amount would require an AD-2 exception (mirroring how AD-6 formally superseded AD-1) — that's a deliberate architecture decision for a future change, not something to slip in silently as part of a patch fix. Documented this reasoning inline in `routes/settlements.ts`.

**Patch (unambiguous fixes):**
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** `recordSettlementRoute` didn't verify the caller is a party to the settlement. **Fix:** added a check that `membership.memberId` (the authenticated caller's own group-member id, from `requireGroupMember`) equals either `from_member_id` or `to_member_id`; rejects 403 otherwise. [client/backend/worker/src/routes/settlements.ts]
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** `recordSettlementRoute` didn't verify `from_member_id`/`to_member_id` belong to `params.groupId`. **Fix:** added a direct `SELECT id FROM group_members WHERE group_id = ? AND id IN (?, ?)` check (deliberately not `listGroupMembers`, which excludes removed members — a settlement can legitimately involve someone who's since left the group) before inserting; rejects 400 if either id doesn't match. [client/backend/worker/src/routes/settlements.ts]
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** `calculateMemberSharesForExpense` silently dropped a removed member's weight, corrupting the denominator. **Fix:** added `resolveMembersForLedger(members, expenses, settlements)` in `groupLedger.ts` — backfills a placeholder `GroupMember` (`status: 'removed'`, `displayName: 'Removed member'`) for any member id referenced by any expense's `paidByMemberId`/`itemAssignments` or any settlement's `fromMemberId`/`toMemberId` but missing from the live `members` list. Both `computeGroupNetBalances` and `computeGroupPairwiseDebts` now call this once and pass the resolved list into every `calculateMemberSharesForExpense` call internally — no caller (`SettleUpScreen.tsx`, `GroupDetailScreen.tsx`) needed to change, since both only ever call the two aggregate functions, never `calculateMemberSharesForExpense` directly. `calculateMemberSharesForExpense`'s own signature/behavior is unchanged (still trusts its `members` argument exactly) — the fix lives at the two call sites that assemble real production data, not in the shared math primitive `verifyGroupBalances.ts` also calls directly with fully-known fixtures. [client/app/domain/groupLedger.ts]
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** Same root cause for `expense.paidByMemberId` not in `members` — same fix as above (`resolveMembersForLedger` covers both `paidByMemberId` and every `itemAssignments` key). [client/app/domain/groupLedger.ts]
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** `recordSettlementRoute` didn't reject non-integer amounts. **Fix:** added `Number.isInteger(amountPiastres)` to the existing finite/positive check. [client/backend/worker/src/routes/settlements.ts]
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** `handleSettle` never checked `recordSettlement`'s result status. **Fix:** checks `result.status !== 'ok'`, sets a new `settleError` state (rendered above the debt rows) and returns without calling `load()` — the UI no longer implies success on failure. [client/app/screens/SettleUpScreen.tsx]
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** `settlingId` was never reset if `recordSettlement` threw. **Fix:** the whole settle/reload sequence is now wrapped in `try/finally`, with both `settlingRef.current` and `setSettlingId(null)` reset in `finally` regardless of success, error-status, or thrown exception. [client/app/screens/SettleUpScreen.tsx]
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** No guard against a double-tap on Settle before the disabled-state re-render commits. **Fix:** added a `settlingRef` (`useRef`, not state) checked and set synchronously at the top of `handleSettle`, before any `await` — a second rapid call sees the ref already set (even though the `settlingId` *state* closure would still read stale/null) and returns immediately. [client/app/screens/SettleUpScreen.tsx]
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** The `cancelled` flag was set but never read inside `load()`. **Fix:** `load` now takes a `cancelledRef` parameter and checks it right after the `Promise.all` resolves, before any `setState` call — `useFocusEffect` passes a ref tied to its cleanup; `handleSettle`'s own reload call passes a fresh always-`false` ref since it isn't tied to focus/unmount. [client/app/screens/SettleUpScreen.tsx]
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** No loading or error UI state. **Fix:** added `isLoading`/`loadError` state around the `load()` call, rendered as a "Loading…" message and an error-styled message respectively; the debt-rows list and "Everyone's settled up" message are now gated on `!isLoading`. [client/app/screens/SettleUpScreen.tsx]

**Deferred (pre-existing, not caused by this change):**
- [x] [Review][Defer] `verifyGroupBalances.ts` only exercises convenient, evenly-divisible scenarios — no coverage for a removed-member in an assignment, a two-way pairwise debt between the same pair, non-evenly-divisible rounding, negative/zero settlement amounts, or the route/DB layer itself. [client/scripts/verifyGroupBalances.ts] — deferred, matches Epic 1's existing precedent of ad hoc verification scripts without a formal test framework.
- [x] [Review][Defer] Per-person tax/service share rounding (via reused `assignment.ts` functions, unmodified by this diff) rounds each member's share independently; largest-remainder division guarantees the *subtotal* split sums exactly, but independently-rounded tax/service shares are not proven to always sum exactly to the expense total under all inputs. [client/app/domain/assignment.ts] — deferred, pre-existing from Epic 1, not introduced by this diff; revisit if group balance conservation ever fails in practice.
- [x] [Review][Defer] `SettleUpScreen` navigating without a valid `groupId` route param isn't explicitly guarded. [client/app/screens/SettleUpScreen.tsx:18] — deferred, low severity, likely constrained by navigation param typing in normal use.

**Dismissed as noise:** 1 (duplicate member `id` within the `members` array passed to `groupLedger.ts` — unreachable given `id` is a DB primary key).

**Out of scope for this story, flagged for Story 2.4's review:** the whole group-expense ledger trusts client-submitted `subtotal_piastres`/`total_piastres` with no server-side arithmetic validation (`submitExpenseRoute`/`isValidSubmitExpenseInput` in `routes/groups.ts`, `db/expenses.ts`) — a buggy or malicious client can desync the tax/service proportions and poison every downstream balance this story computes. This lives in Story 2.4's files, not this story's diff — relaying for that review.

## Dev Notes

- **Architecture compliance (AD-6):** This story's backend surface (`routes/settlements.ts`, `db/settlements.ts`) lives inside the D1-backed groups/accounts store `ARCHITECTURE-SPINE.md`'s AD-6 establishes, authenticated via `requireAuth` + `requireGroupMember` (`authMiddleware.ts`) — consistent with AD-6's rule that the groups surface is a separate, authenticated, stateful surface from the stateless extraction proxy (AD-1).
- **Money arithmetic (AD-3):** `groupLedger.ts` does **not** re-derive money math — it delegates to `assignment.ts`'s `calculatePersonSubtotals`/`calculatePersonTotals`, which are the same integer-piastres functions Epic 1's code review already verified against AD-3 (round-half-up, no floating point). `computeGroupNetBalances`/`computeGroupPairwiseDebts` only add/subtract those already-integer values — no new arithmetic risk introduced. `settlements.amount_piastres` is stored as `INTEGER` in the migration (`0002_rename_to_groups.sql:88`), consistent.
- **FR-12 compliance (permanent non-goal, "no in-app payment movement... in v1 or the full vision"):** Confirmed by reading every file in this story's scope — `handleSettle` only calls `recordSettlement`, which only inserts a DB row. There is no payment SDK import, no external payment API call, and no deep-link URL construction anywhere in `SettleUpScreen.tsx`, `routes/settlements.ts`, or `db/settlements.ts`. "Settle" in the UI is a self-reported bookkeeping action ("we settled this outside the app"), not a payment trigger.
- **Known scope limitation (flagged honestly, not a defect):** `computeGroupPairwiseDebts` does not net opposing directions of the same pair or collapse multi-hop cycles into a minimal transaction set — the source comment (`groupLedger.ts:109-116`) explicitly calls this "Stage 1 scope" and notes a netting/minimization pass "can be added later as one more pure function here without touching this one." AC #1's phrase "minimal set of pairwise debts" is therefore only partially satisfied today: balances are correct and conserve to zero (verified), but the displayed debt list is not yet reduced to the fewest possible transactions. Worth a follow-up story if this surfaces as real friction.
- **Verification is a standalone script, not automated test infra** — consistent with Epic 1's established pattern (`verifySplitCalculation.ts`, `verifyAssignment.ts`); no test framework exists in this repo yet. I ran `npx tsx client/scripts/verifyGroupBalances.ts` during this documentation pass — not re-run automatically by CI (none exists, per Architecture's own Deferred section).

### Project Structure Notes

Matches the documented source tree in `ARCHITECTURE-SPINE.md` and `epics.md`'s Capability Map: `app/domain/groupLedger.ts` (pure, unit-verified logic), `app/screens/SettleUpScreen.tsx` (UI), `backend/worker/src/routes/settlements.ts` + `db/settlements.ts` (D1-backed groups surface per AD-6). No structural deviations found.

### References

- [Source: client/app/domain/groupLedger.ts#calculateMemberSharesForExpense, computeGroupNetBalances, computeGroupPairwiseDebts]
- [Source: client/app/screens/SettleUpScreen.tsx]
- [Source: client/backend/worker/src/routes/settlements.ts#recordSettlementRoute]
- [Source: client/backend/worker/src/db/settlements.ts#insertSettlement, listGroupSettlements]
- [Source: client/backend/worker/migrations/0002_rename_to_groups.sql#settlements table, lines 83-93]
- [Source: client/scripts/verifyGroupBalances.ts — 6 checks, all passing as of this documentation pass]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-hasebly-2026-07-16/ARCHITECTURE-SPINE.md#AD-6, AD-3]
- [Source: _bmad-output/planning-artifacts/prds/prd-hasebly-2026-07-16/prd.md#FR-12, FR-17]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (retroactive documentation pass, 2026-07-29)

### Debug Log References

`npx tsc --noEmit -p .` clean from both `client/` and `client/backend/worker/` after the 2026-07-30 code-review fixes.

### Completion Notes List

- This story file is a retroactive backfill against pre-existing, already-functional code (built prior to/alongside this BMad workflow being applied to Epic 2), not a pre-implementation spec. All "Tasks" above describe what was found already built, not what remains to be done.
- Code review (2026-07-29) found 3 high-severity, 4 medium, 4 low-severity patch findings plus 2 decision-needed items — all resolved 2026-07-30: 2 decisions resolved by the user (Stage-1 debt minimization accepted, AC reworded; overpayment capped by the existing UI's lack of a free-amount input, documented rather than adding a server-side balance recomputation that would conflict with AD-2), all 10 patch findings implemented and typechecked clean.
- The 3 high-severity findings (settlement authorization, cross-group member-id validation, removed-member ledger math) were real money-correctness/security gaps, not nitpicks — see each finding's implementation note above for exactly what changed.

### File List

- client/app/domain/groupLedger.ts (modified — `resolveMembersForLedger` added)
- client/app/screens/SettleUpScreen.tsx (modified — result-check, double-tap guard, loading/error state, cancelled-flag fix)
- client/backend/worker/src/routes/settlements.ts (modified — caller/cross-group validation, integer check)
- client/backend/worker/src/db/settlements.ts (read, unchanged)
- client/backend/worker/migrations/0002_rename_to_groups.sql (settlements table only, read, unchanged)
- client/scripts/verifyGroupBalances.ts (read, unchanged)
