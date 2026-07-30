# Story 2.5: View Group Detail and Expense History

Status: done

<!-- Retroactive backfill: code already implemented (2026-07 working tree, uncommitted at time of documentation) and confirmed functional per this conversation's earlier read-only inventory. This doc documents existing behavior; it did not precede implementation. -->

## Story

As a group member,
I want to see a group's members and its logged expenses,
so that I understand the shared spending before settling up.

## Acceptance Criteria

1. **Given** I'm a member of a group **When** I open its detail screen **Then** I see its member list (with status: pending/active/removed) and its logged expenses

## Tasks / Subtasks

- [x] Build `GroupDetailScreen` reading `groupId` from route params (AC: #1) — `client/app/screens/GroupDetailScreen.tsx:16-17`
- [x] Fetch group + members via `getGroup(token, groupId)` and expenses + settlements via `listGroupExpenses(token, groupId)` in parallel on focus (AC: #1) — `client/app/screens/GroupDetailScreen.tsx:53-77`
- [x] Render each member's row with display name, a `(pending)` suffix when `status === 'pending'`, and a computed net balance label (AC: #1, partial — see Dev Notes gap) — `client/app/screens/GroupDetailScreen.tsx:101-119`
- [x] Backend: `getGroupRoute` returns `{group, members}`, gated by `requireGroupMember` — `client/backend/worker/src/routes/groups.ts:39-55`
- [x] Backend: `listExpensesRoute` returns `{members, expenses, settlements}`, gated by `requireGroupMember` — `client/backend/worker/src/routes/groups.ts:81-97`
- [x] Backend: `listGroupExpenses` joins expenses → expense_items → expense_item_assignments into nested `ExpenseWithDetails[]` — `client/backend/worker/src/db/expenses.ts:90-145`
- [x] Wire navigation actions from detail screen: Log Expense (camera/gallery), Invite Member, Settle Up — `client/app/screens/GroupDetailScreen.tsx:121-142`
- [x] Register `GroupDetail: { groupId: string }` route param and screen in the navigator — `client/app/navigation/types.ts:17`, `client/App.tsx:118`

### Review Findings

- [x] [Review][Patch] *(Decision resolved 2026-07-30: build the list — IMPLEMENTED.)* No browsable expense-history list on GroupDetailScreen — AC #1 partially unmet — `client/app/screens/GroupDetailScreen.tsx:53-119`. **Fix implemented:** added an "Expenses" section below the balance rows, rendering each logged expense (description, formatted total via `formatPiastresAsEGP`, payer name resolved from `members`, and date), sorted newest-first, with an empty-state message when the group has none. Required adding `description`/`createdAt` as optional fields to the `GroupExpense` domain type (`client/app/domain/groupLedger.ts`) and threading them through `mapExpense` in `client/app/api/groupApi.ts` — both wire fields already existed on `ExpenseWire` but were previously dropped by the mapper. Made optional (not required) on the domain type since no ledger-math function reads them, so `verifyGroupBalances.ts`'s synthetic fixtures didn't need updating. Verified with `npx tsc --noEmit -p .` from `client/` (clean, exit 0).
- [x] [Review][Defer] `handleLogExpense` silently no-ops during the initial members-fetch loading window — `client/app/screens/GroupDetailScreen.tsx:79-87`. Tapping "Log Expense" before the async `getGroup`/`listGroupExpenses` fetch resolves (so `members` is still `[]`) does nothing with zero feedback. Low severity, consistent with the app's existing lack of loading-state UI elsewhere (not a new deviation) — deferred, pre-existing pattern.

Dismissed as noise (1): "Member list never shows `status: removed`, contradicting AC #1's literal `pending/active/removed` wording" — `listGroupMembers` deliberately filters `status != 'removed'` server-side; showing removed members in a balance view would be actively wrong, so this is correct behavior against an over-literal AC reading, not a defect.

Also independently verified during this review: both `getGroupRoute` and `listExpensesRoute` are gated by `requireGroupMember`, which checks `status = 'active'` specifically (`authMiddleware.ts:28`) — a `pending` member (invited but not yet signed up) cannot view group detail, and no non-member can view it by guessing a `groupId`. This confirms the "no authorization check" concern speculated in this story's original Dev Notes does not apply — the check exists and is correct.

## Dev Notes

- **Architecture compliance (AD-6):** Both backend routes this screen depends on (`getGroupRoute`, `listExpensesRoute`) call `requireGroupMember` after `requireAuth` — a non-member cannot view group detail or its expenses even by guessing/knowing a `groupId`. This matches AD-6's rule that the groups/accounts surface is authenticated, separate from the stateless extraction proxy.
- **Member status handling:** `listGroupMembers` (db/groups.ts:54-61) filters out `status = 'removed'` at the query level — the screen never has to defend against removed members appearing. `pending` members are included and visually flagged inline (`(pending)` suffix); `active` members show no suffix.
- **Balance computation is client-side:** `GroupDetailScreen` calls `computeGroupNetBalances(expenses, settlements, members)` from `client/app/domain/groupLedger.ts` — the backend returns raw expense/settlement rows only, consistent with AD-2's "all split calculation is client-side domain logic" principle extended to group balances.
- **⚠️ Gap vs. literal AC text:** The AC says the fronter sees "its logged expenses," but the screen only renders a computed **net balance per member** — it fetches `expenses` and `settlements` into state (used as inputs to `computeGroupNetBalances`) but never renders an actual list of individual expenses (description, date, amount, who paid). There is no expense-history UI on this screen today. This is functionally covered by Story 2.6 (Settle Up) for the *balance* half of the AC, but the *history* half (a literal list of past logged expenses) does not exist anywhere in the app yet. Flagging as a real, honest gap — not a blocker for `review` status since the balance-of-what's-owed need is met, but worth a follow-up story or an explicit scope note if a browsable expense history is actually required.
- **No empty-state message:** if a group has zero members or zero expenses, the screen renders blank sections silently (no "no expenses yet" text) rather than an explicit empty state. `handleLogExpense` silently no-ops if `members.length === 0` rather than surfacing why the button did nothing.
- **Data fetch redundancy:** `listExpensesRoute` also returns `members`, but the screen only uses the `members` array from `getGroupRoute`'s response, not the duplicate one in the expenses response — harmless, just a duplicated payload field.

### Project Structure Notes

Matches the established source tree: `app/screens/GroupDetailScreen.tsx` (UI), `app/api/groupApi.ts` (client per AD-4-style contract, group surface), `app/domain/groupLedger.ts` (pure balance calc), `backend/worker/src/routes/groups.ts` + `db/groups.ts` + `db/expenses.ts` (server). No structural deviation from Epic 1's established `screens/domain/api` split.

### References

- [Source: client/app/screens/GroupDetailScreen.tsx]
- [Source: client/backend/worker/src/routes/groups.ts#getGroupRoute, #listExpensesRoute]
- [Source: client/backend/worker/src/db/groups.ts#listGroupMembers]
- [Source: client/backend/worker/src/db/expenses.ts#listGroupExpenses]
- [Source: client/app/navigation/types.ts]
- [Source: client/App.tsx]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-hasebly-2026-07-16/ARCHITECTURE-SPINE.md#AD-6]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (retroactive documentation pass, 2026-07-29)

### Debug Log References

None — documentation-only pass, no code changes made.

### Completion Notes List

- Retroactive backfill against pre-existing, already-functional code (not a pre-implementation spec).
- One real product gap identified and documented above: no browsable list of individual logged expenses on this screen, only computed net balances.

### File List

- client/app/screens/GroupDetailScreen.tsx (read, **modified** — expense-history list, 2026-07-30)
- client/backend/worker/src/routes/groups.ts (read)
- client/backend/worker/src/db/groups.ts (read)
- client/backend/worker/src/db/expenses.ts (read)
- client/app/navigation/types.ts (read)
- client/App.tsx (read)
- client/app/domain/groupLedger.ts (**modified** — added optional `description`/`createdAt` fields, 2026-07-30)
- client/app/api/groupApi.ts (**modified** — thread `description`/`createdAt` through `mapExpense`, 2026-07-30)
