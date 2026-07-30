# Story 2.4: Log a Group Expense

Status: done

<!-- Retroactive documentation pass — implementation predates this story file. See Dev Agent Record. -->

## Story

As a fronter who is also a group member,
I want to route a completed split (Stories 1.1–1.7) to a group instead of only local history,
so that the group has a shared record of who paid and what was owed.

## Acceptance Criteria

1. Given I've completed the Capture → Extract → Tax/Service → Assign → Review flow (Epic 1) with a group selected, when I reach the Final Split screen, then the split is submitted to the group via the backend instead of saved to local-only history (FR-16).
2. And the solo (no group selected) flow is unaffected and still saves locally (regression guard on Epic 1).
3. Given a group expense is submitted, when it's saved, then it records which member paid (`paid_by_member_id`) and each member's computed share.

## Tasks / Subtasks

- [x] Extend `SplitSession` with an optional `group: GroupExpenseContext | null` field and `beginGroupExpense`/`setPaidByMemberId` actions (AC #1, #2) — `client/app/domain/session.tsx:26-30,57-58,129-146`
- [x] Trigger group-expense mode from `GroupDetailScreen`'s "Log Expense" action: seeds `people` from the group roster via `beginGroupExpense`, then navigates into the existing Epic-1 Capture flow unchanged (AC #1) — `client/app/screens/GroupDetailScreen.tsx:78-86`
- [x] Add a "Who paid?" member picker to `ItemAssignmentScreen`, shown only when `session.group` is set, calling `setPaidByMemberId` (AC #3) — `client/app/screens/ItemAssignmentScreen.tsx:208-226`
- [x] Branch `FinalSplitScreen`'s single save effect on `session.group`: group path maps `itemAssignments` (person-index-keyed) to `group_member_id`-keyed weights and calls `submitGroupExpense`; solo path is the original unmodified `saveSplitToHistory` call (AC #1, #2) — `client/app/screens/FinalSplitScreen.tsx:44-96`
- [x] Add `submitGroupExpense` client API function posting to `/groups/:groupId/expenses` (AC #1, #3) — `client/app/api/groupApi.ts:146-149`
- [x] Add `submitExpenseRoute` Worker handler: auth + group-membership check, validates payload shape, inserts via `insertExpense` (AC #3) — `client/backend/worker/src/routes/groups.ts:115-131`
- [x] Rename `db/expenses.ts`'s `household_id`/`household_member_id` columns and params to `group_id`/`group_member_id` (pure rename, no logic change — confirmed via `git diff`) (AC #3) — `client/backend/worker/src/db/expenses.ts`
- [x] **Fix (2026-07-29, during this review pass):** Hide the ad-hoc "Add a person" input when `session.group` is set, replacing it with a note pointing at Invite Member (Story 2.3) — closes the silent item-assignment-loss gap below at its source rather than patching the drop after the fact — `client/app/screens/ItemAssignmentScreen.tsx:209-227`. Verified with `tsc --noEmit` (clean).

### Review Findings

- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** Group expense silently saved to local history instead of the group ledger if the session token was missing/expired mid-flow — `client/app/screens/FinalSplitScreen.tsx:44`. **Fix:** the save effect now separates the `session.group`-truthy check from the `token`-truthy check; when a group expense is in progress but `token` is missing, a `submitError` state is set and rendered (via `pillTextStyle('critical')`) instead of silently falling through to `saveSplitToHistory`. Nothing is saved anywhere in that case — the fronter is told to sign in again and re-enter the expense.
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** No server-side validation that `paid_by_member_id` or the member-id keys inside `item_assignments` actually belong to the target group — `client/backend/worker/src/routes/groups.ts` (`submitExpenseRoute`). **Fix:** `submitExpenseRoute` now fetches `listGroupMembers(env, groupId)`, builds a `Set` of valid member IDs, and rejects (400) if `paid_by_member_id` or any key across `item_assignments` isn't in that set.
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** `GroupDetailScreen.handleLogExpense` silently no-op'd with no user feedback when `members.length === 0`. **Fix:** added a `logExpenseMessage` state, set and rendered when the guard trips ("Still loading this group's members — try again in a moment.").
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** The group-mode note in `ItemAssignmentScreen.tsx` pointed the fronter at an action unreachable from that screen. **Fix:** reworded to "Assigning items among this group's members. To include someone new, invite them from the group screen, then start this expense again."
- [x] [Review][Patch] **IMPLEMENTED (2026-07-30).** *(Relayed from Story 2.6's review, 2026-07-29)* The group-expense ledger trusted client-submitted `subtotal_piastres`/`tax_piastres`/`service_piastres`/`total_piastres` with no server-side arithmetic validation. **Fix:** `SubmitExpenseBody`/`SubmitExpenseInput` gained six rate fields (`tax_enabled`, `tax_rate_percent`, `service_enabled`, `service_rate_percent`, `other_service_enabled`, `other_service_rate_percent`), sent by `FinalSplitScreen` from `session.taxService`. New `client/backend/worker/src/expenseCalc.ts` mirrors `splitCalculation.ts`'s exact AD-3 compounding formula (service on raw subtotal, then tax on service-inclusive amount, round-half-up via a new `roundHalfUp` in `worker/src/money.ts`). `submitExpenseRoute` now: (1) checks `subtotal_piastres` equals the exact integer sum of submitted item prices, (2) recomputes service/other-service/tax/total from the submitted subtotal + rates and rejects (400) if any diverge from the client-submitted value by more than `EXPENSE_TOTALS_TOLERANCE_PIASTRES` (2 piastres, mirroring `reconciliation.ts`'s `RECONCILIATION_TOLERANCE_PIASTRES`).
- [x] [Review][Defer] Stale "Add a person above to assign this item." message (unchanged, outside this diff) remains reachable in a zero-people + group-mode state — deferred, pre-existing. Not currently reachable in practice: `GroupDetailScreen.handleLogExpense` already guards `members.length === 0` before calling `beginGroupExpense`, so `session.group` can't currently be set with an empty `people` array — but it's a fragile cross-file invariant worth tightening if that guard ever moves.
- [x] [Review][Defer] `submitGroupExpense`'s `.catch(() => {})` silent-failure (`client/app/screens/FinalSplitScreen.tsx:64-68`) — deferred, pre-existing pattern. Already reasoned about in this story's own Dev Notes as a deliberate match to the existing local-history save and Epic 1's `extractReceipt.ts` precedent (best-effort, never block the fronter) — now applies to a *shared* record other group members depend on, not just local history, which raises the stakes but doesn't change the classification.

## Dev Notes

**Regression guard mechanism (AC #2), verified by direct read of both files:**
- `SplitSession.group` (`session.tsx:38`) defaults to `null` (`session.tsx:75`) and is only ever set by `beginGroupExpense`, which is only called from `GroupDetailScreen`'s "Log Expense" action (`GroupDetailScreen.tsx:83-86`). The Home screen's ordinary Capture entry point never calls it, so `session.group` is `null` for every solo split.
- `FinalSplitScreen`'s single save `useEffect` (`FinalSplitScreen.tsx:35-96`) checks `if (session.group && session.group.paidByMemberId && token)` at line 44. When false — the entire solo case — execution falls through unchanged to the original `saveSplitToHistory({...})` call at line 86, byte-for-byte the same as before Epic 2. Confirmed by reading the full file: no other code path was altered inside this component; the branch is additive, not a rewrite.
- Every upstream screen (Capture, ExtractedItems, TaxService, ItemAssignment, Review) is unaware of groups at all — `people` and `itemAssignments` stay plain index-keyed structures per Architecture AD-2's "split calc stays client-side" rule regardless of solo/group mode. Only `FinalSplitScreen` reads `session.group`, and only at save time — this matches the intent documented in `session.tsx:19-25`'s comment on `GroupExpenseContext`.
- `AD-6` (Architecture Spine) governs the new `submitExpenseRoute`/`insertExpense` surface as a Worker-side addition scoped apart from the stateless extraction proxy (AD-1) — no conflict, since expense-splitting math itself still happens entirely client-side in `FinalSplitScreen` before the already-computed totals are POSTed (AD-2 preserved).

**Gaps found worth flagging (honest documentation, not scored against the story's ACs since none of this is explicitly required by them):**
1. ~~**Silent item-assignment loss for ad-hoc guests in group mode.**~~ — **FIXED (2026-07-29).** `ItemAssignmentScreen`'s "Add a person" input (`ItemAssignmentScreen.tsx:190-206`, pre-fix) was not gated behind `!session.group` — a fronter could add an extra person during a *group* expense who had no `group_member_id`. In `FinalSplitScreen`'s mapping loop (line 55-59), `memberId` was `undefined` for that person, and the `if (memberId)` guard (line 56) silently dropped their item-weight entries from the submitted `item_assignments`. The local Review/FinalSplit screens still displayed that person's share correctly (client-side calc uses person-index, not member-id), but the group's server-side ledger permanently lost that item's cost — no error, no warning. **Fix:** the ad-hoc "Add a person" row is now hidden entirely when `session.group` is set (`ItemAssignmentScreen.tsx:209-227`), replaced with a note directing the fronter to Invite Member (Story 2.3) instead — the scenario is prevented at its source rather than caught after the fact, consistent with this codebase's established pattern (e.g. Story 1.5/1.6's fixes) of eliminating silent-loss paths rather than adding reactive validation. `tsc --noEmit` clean.
2. **No idempotency key on `insertExpense`.** `expenseId = generateId()` is fresh on every call (`db/expenses.ts`); there's no dedupe/idempotency key tied to the client session. Not currently exploitable — `savedToHistoryRef` (line 33, `FinalSplitScreen.tsx`) guards against the effect firing twice for one screen instance, and there's no client-side retry — but if retry logic is ever added to `submitGroupExpense`/`callJson`, duplicate expenses become possible with no server-side guard.
3. **Silent failure on submit, consistent with existing precedent.** `submitGroupExpense`'s `.catch(() => {})` (`FinalSplitScreen.tsx:78-82`) swallows any network/timeout error with no user-visible feedback and no retry — the fronter sees their split fine locally, but it may never reach the group, with no signal that happened. This matches the same "best-effort, never block the fronter" pattern already used for the local `saveSplitToHistory` call and for `extractReceipt.ts` (flagged in Epic 1's deferred-work log) — consistent with precedent, not a new deviation, but worth being aware it now applies to a *shared* record other group members depend on, not just local history.

### Project Structure Notes

Matches the documented source tree: screens in `client/app/screens/`, session/domain state in `client/app/domain/`, API client in `client/app/api/`, Worker routes/db in `client/backend/worker/src/`. No structural deviation.

### References

- [Source: client/app/screens/FinalSplitScreen.tsx#L21-96] — save-effect branch point
- [Source: client/app/domain/session.tsx#L26-30,57-58,129-146] — `GroupExpenseContext`, `beginGroupExpense`, `setPaidByMemberId`
- [Source: client/app/screens/GroupDetailScreen.tsx#L78-86] — group-expense trigger
- [Source: client/app/screens/ItemAssignmentScreen.tsx#L190-226] — add-person gap, paid-by picker
- [Source: client/app/api/groupApi.ts#L29-51,146-149] — `callJson`, `submitGroupExpense`
- [Source: client/backend/worker/src/routes/groups.ts#L115-131] — `submitExpenseRoute`
- [Source: client/backend/worker/src/db/expenses.ts] — `insertExpense` (git diff confirms pure household→group rename, no logic change)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-hasebly-2026-07-16/ARCHITECTURE-SPINE.md#AD-6] — groups/accounts surface scope
- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.4] — acceptance criteria origin

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (retroactive documentation pass, 2026-07-29)

### Debug Log References

None — documentation pass only, no code changes made.

### Completion Notes List

- This story's implementation predates this story file. Documented against already-written, already-functional code (confirmed working end-to-end per an earlier read-only inventory of the working tree) rather than written to guide new implementation.
- Three gaps found during documentation (see Dev Notes). Gap #1 (silent item-assignment loss) was assessed as a real money-correctness defect and fixed during this same pass, 2026-07-29. Gaps #2 (no idempotency key) and #3 (silent submit-failure catch) remain flagged, unfixed — both explicitly triaged as `[Review][Defer]` during code review (pre-existing patterns, not caused by this story).
- Code review (2026-07-29) found 5 `[Review][Patch]` findings, all implemented 2026-07-30: explicit error on token-missing mid-flow, server-side member-ID validation, empty-members feedback on the trigger screen, a copy fix, and server-side arithmetic recomputation/verification for group expenses (relayed from Story 2.6's review). `npx tsc --noEmit` clean for both `client/` and `client/backend/worker/` after all fixes.
- Status left as `review` pending final confirmation this story's fixes don't need a second review pass — sprint-status.yaml sync is handled centrally, not by this pass.

### File List

- client/app/screens/FinalSplitScreen.tsx (modified — token-missing error, rate fields in submit payload)
- client/app/domain/session.tsx (read, documented)
- client/app/screens/GroupDetailScreen.tsx (modified — empty-members feedback)
- client/app/screens/ItemAssignmentScreen.tsx (modified — gap #1 fix 2026-07-29; copy fix 2026-07-30)
- client/app/api/groupApi.ts (read, documented — partial)
- client/app/api/groupTypes.ts (modified — `SubmitExpenseBody` rate fields)
- client/backend/worker/src/routes/groups.ts (modified — member-ID validation, arithmetic recomputation)
- client/backend/worker/src/db/expenses.ts (modified — `SubmitExpenseInput` rate fields)
- client/backend/worker/src/money.ts (modified — added `roundHalfUp`)
- client/backend/worker/src/expenseCalc.ts (new — server-side mirror of `calculateSplitTotals`)
