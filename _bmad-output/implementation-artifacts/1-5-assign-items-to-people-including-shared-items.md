---
baseline_commit: NO_VCS
---

# Story 1.5: Assign Items to People, Including Shared Items

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a fronter,
I want to assign each item to whoever ordered it, including items shared by more than one person,
so that each person's share reflects what they actually had.

## Acceptance Criteria

1. Given the extracted item list and a roster of people I add ad hoc for this split, When I tap an item and select who had it, Then the item is assigned to that person. [Source: prd.md#FR-7]
2. Given an item was shared, When I assign it to more than one person, Then its cost splits evenly among just its assignees, not the whole table. [Source: prd.md#FR-7]
3. Given an item has not yet been assigned to anyone, When I attempt to proceed to review, Then the unassigned item is visually flagged and I cannot proceed past it silently. [Source: prd.md#FR-7]
4. Given all items are assigned, When totals are computed, Then each person's total equals their assigned items' cost plus their proportional share of tax and service, based only on what they were assigned. [Source: prd.md#FR-8]

## Tasks / Subtasks

- [x] Task 1: Add assignment pure functions to `app/domain/` (AC: #2, #3, #4)
  - [x] `client/app/domain/assignment.ts` created, separate from `splitCalculation.ts` per the Structural Seed's own naming split.
  - [x] `splitItemAmongAssignees` implemented exactly as specified — base + remainder-to-first-N, always sums to the exact input price.
  - [x] `calculatePersonSubtotals` implemented — accumulates per-person-index subtotals from every item's split shares.
  - [x] `calculatePersonTotals` implemented — proportional round-half-up tax/service share per person, no forced reconciliation.
  - [x] `areAllItemsAssigned` implemented.
- [x] Task 2: Extend Story 1.4's verification-script pattern to cover the new assignment logic (AC: #2, #4)
  - [x] `client/scripts/verifyAssignment.ts` created with all the specified assertions, plus a couple more (single-assignee, zero-assignee, unevenly-divisible split, zero-subtotal degenerate case). **Found and fixed a bug in the verification script itself, not the implementation**: an early version of the even-split test computed its "expected" value via plain division (`taxPiastres / 2`) instead of applying `roundHalfUp` the same way the real function does, so it flagged a false failure on the odd `taxPiastres` case (2885 is odd; half is 1442.5, which correctly rounds up to 1443). Fixed the test's expected-value calculation, not the underlying function — the function was right the whole time.
  - [x] Ran both scripts via `npx tsx` — 18/18 checks pass in `verifySplitCalculation.ts` (Story 1.4, re-confirmed no regression), 17/17 in `verifyAssignment.ts`.
- [x] Task 3: Extend session state with the roster and item assignments (AC: #1, #2, #3, #4)
  - [x] `Person`, `people: Person[]`, `itemAssignments: Record<number, number[]>` added to `SplitSession`; `addPerson`/`setItemAssignees` actions added.
  - [x] `clearPhoto()` extended to also reset `people`/`itemAssignments`.
- [x] Task 4: Add a "Continue" control to `TaxServiceScreen` (plumbing)
  - [x] Added, navigating to `ItemAssignment`. No seeding logic needed, as anticipated.
- [x] Task 5: Build the item-assignment screen (AC: #1, #2, #3, #4)
  - [x] `client/app/screens/ItemAssignmentScreen.tsx` created and registered.
  - [x] Add-person `TextInput` + button, no roster editing/removal (matches scope).
  - [x] Per-item toggle-chip assignment (multi-select for shared items) with a red "Unassigned" flag on any item with zero assignees.
  - [x] Live per-person running-total preview panel via `calculatePersonSubtotals`/`calculatePersonTotals`.
  - [x] Continue is **not** disabled — per AC #3's literal "cannot proceed past it silently," it's always tappable and shows an inline blocking message ("Add at least one person..." / "Assign every item...") instead of navigating when invalid, rather than a silently-inert disabled button. Navigates to `ReviewPlaceholder` on success.
  - [x] Back control to `TaxServiceScreen`, present from the start.
- [x] Task 6: Add a minimal review placeholder screen (landing point for Task 5's Continue)
  - [x] `client/app/screens/ReviewPlaceholderScreen.tsx` created and registered, same honest-stub pattern as `ManualEntryScreen`.

### Review Findings

- [x] [Review][Patch] `blockedMessage` is never cleared when a person is successfully added, leaving a stale blocking message on screen [client/app/screens/ItemAssignmentScreen.tsx]
- [x] [Review][Patch] No visible feedback when "Add" is pressed with an empty/whitespace-only name — contradicts this story's own stated validation-feedback intent [client/app/screens/ItemAssignmentScreen.tsx]
- [x] [Review][Defer] `TaxServiceScreen`'s draft-commit logic has multiple silent-data-loss/no-error-feedback bugs (stale-closure double-commit loses the first of two rate edits; toggle silently discards an unparseable draft with no error flag; toggle never clears a stale error flag; Back navigates away before an error can ever be shown) [client/app/screens/TaxServiceScreen.tsx] — deferred, pre-existing from Story 1.3, not introduced by this story
- [x] [Review][Defer] No stable person ID — people identified purely by array index [client/app/domain/session.tsx] — deferred, already acknowledged in this story's own Dev Notes
- [x] [Review][Defer] No way to remove or rename a person once added to the roster [client/app/domain/session.tsx, client/app/screens/ItemAssignmentScreen.tsx] — deferred, real usability gap but not required by any AC/FR
- [x] [Review][Defer] No duplicate-name protection when adding a person [client/app/screens/ItemAssignmentScreen.tsx] — deferred, out of this story's stated minimal-validation scope
- [x] [Review][Defer] `calculatePersonSubtotals` has no bounds-check on `personIndex` [client/app/domain/assignment.ts] — deferred, currently unreachable (no person-removal path exists yet)
- [x] [Review][Defer] No `KeyboardAvoidingView` on scroll screens with text inputs [client/app/screens/ItemAssignmentScreen.tsx, client/app/screens/TaxServiceScreen.tsx] — deferred, pre-existing pattern across every screen since Story 1.2
- [x] [Review][Defer] Accessibility labels can collide for two items with identical printed names [client/app/screens/ItemAssignmentScreen.tsx] — deferred, minor a11y correctness gap

## Dev Notes

- **Why item/person array-index keys are safe here:** items are never reordered/added/removed after extraction (Story 1.2 established this; Story 1.2's code review flagged index-as-React-`key` as safe under that constraint and revisit-worthy only when Story 1.6 adds real list mutation). This story adds a second array (`people`) under the identical constraint — no removal/reorder feature is in scope — so keying `itemAssignments` by item array index and storing assignees as person array indices is equally safe. If a future story adds "remove person" or "reorder items," this indexing scheme breaks and must move to stable IDs — flag it then, not preemptively now.
- **Exactness vs. tolerance — read this before implementing Task 1.** Two different money-splitting operations in this story have two different correctness bars, and conflating them is the most likely mistake: splitting **one item's price** among its assignees (AC #2) must be *exact* (no leaked or invented piastre — every piastre of that item's price lands on exactly one assignee). Splitting **tax/service proportionally** across people (AC #4) is explicitly allowed "rounding tolerance" per FR-8's own consequence text — independent per-person round-half-up is sufficient; do not build a reconciliation/apportionment layer to force an exact match, that's over-engineering relative to what's asked and is FR-10/Story 1.6's job anyway (reconciling against the *printed* total, a different comparison entirely).
- **No automated test framework** — same situation as every prior story. `client/scripts/verifyAssignment.ts` follows `verifySplitCalculation.ts`'s exact pattern (Story 1.4): run via `npx tsx`, not plain `node` (Story 1.4's Dev Agent Record documents exactly why plain `node` fails on a script importing from `app/domain/` under this project's `moduleResolution: "bundler"` setup).
- **Naming:** PRD Glossary defines `Assignment` explicitly ("tapping an item to the person(s) who ordered it; can have multiple assignees"). It does not separately define "Person" or "Roster" as glossary terms, but the Assignment definition itself says "person(s)" — `Person`/`people` used here is the glossary's own informal vocabulary, not an invented synonym.
- **Testing:** No automated test coverage beyond the verification scripts, consistent with every prior story's Testing Requirements section and Architecture's explicit CI/testing-infrastructure deferral for v1.

### Project Structure Notes

- New files: `client/app/domain/assignment.ts`, `client/scripts/verifyAssignment.ts`, `client/app/screens/ItemAssignmentScreen.tsx`, `client/app/screens/ReviewPlaceholderScreen.tsx`.
- Modified: `client/app/domain/session.tsx` (roster + assignment state/actions), `client/app/screens/TaxServiceScreen.tsx` (Continue control), `client/app/navigation/types.ts` and `client/App.tsx` (two new routes).
- No Worker changes — this story is entirely client-side (AD-2: split calculation, which assignment is part of, is on-device only).

### References

- [Source: prd.md#FR-7, #FR-8 — assignment and per-person fair-share requirements]
- [Source: ARCHITECTURE-SPINE.md#AD-2, #AD-3 — client-side split calculation, integer-money rounding rule]
- [Source: ARCHITECTURE-SPINE.md — Structural Seed (`app/domain/` = "compounding calc, **assignment**, reconciliation")]
- [Source: epics.md Story 1.5 — acceptance criteria this story's ACs are derived from]
- [Source: 1-2-extract-items-via-vision-llm-proxy.md — array-index-as-key safety reasoning this story extends to `people`]
- [Source: 1-4-compound-tax-on-service-inclusive-subtotal.md — the verification-script pattern (no test framework) this story's Task 2 follows, and the plain-`node`-doesn't-work gotcha]

## Previous Story Intelligence (from Stories 1.2-1.4)

- **Session state pattern:** full-object/array-replace actions (`setExtractionResult`, `setTaxService`, and now `addPerson`/`setItemAssignees`) — screens spread-and-override, `session.tsx` never contains calculation logic.
- **Editing pattern:** any field that commits a fronter's typed input should use the draft-then-commit-on-blur pattern with visible error feedback on rejection (Story 1.3's code review) — applies to the "add person" name input if it needs any validation (e.g. rejecting an empty/whitespace-only name before calling `addPerson`).
- **Every screen needs a Back control from the moment it's written** — not patched in during review (Story 1.2's code review lesson, followed cleanly in every story since).
- **Verification-script pattern established in Story 1.4:** plain functions, no framework, imported from the real production module, run via `npx tsx` (not plain `node` — see that story's Dev Agent Record for the exact module-resolution reason), asserting via a tiny hand-rolled `assertEqual` + exit-code convention.
- **`calculateSplitTotals`** (`client/app/domain/splitCalculation.ts`) returns `{subtotalPiastres, servicePiastres, taxPiastres, totalPiastres}` — this story's `calculatePersonTotals` consumes that shape directly rather than recomputing receipt-level totals itself.
- **No git history exists** (`baseline_commit: NO_VCS`) — still true; code review for this story will again need to review full file contents, not an incremental diff.
- **Stack versions:** Expo SDK 57.0.7, React Native 0.86.0, React 19.2.3, TypeScript ~6.0.3, Node v25.2.1.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (via Claude Code)

### Debug Log References

- `cd client && npx tsc --noEmit` — clean at every task boundary.
- `npx tsx client/scripts/verifyAssignment.ts` — 17/17 checks pass (after fixing a bug in the verification script itself, not the implementation — see Task 2's completion note).
- `npx tsx client/scripts/verifySplitCalculation.ts` — 18/18 checks still pass, confirming Story 1.4's work has no regression from this story's changes.
- `cd client/backend/worker && npm run typecheck` — clean (unaffected; this story is entirely client-side).

### Completion Notes List

- Implemented all 6 tasks. Both TypeScript projects typecheck cleanly with strict mode on.
- Deliberately did **not** apply the draft-then-commit-on-blur input pattern (Story 1.3's code review lesson) to the "add person" name field: that pattern exists specifically because price/rate fields *reformat* their displayed value from committed state (`formatPiastresAsEGP`, `String(rate)`), which conflicts with mid-typing edits. The name field has no such reformatting — it's a plain accumulate-then-clear input with no computed display value to fight with — so the bug class that pattern fixes doesn't apply here. Used a simpler immediate-value input with validation (trim + reject-empty) on submit instead.
- One real bug found and fixed during Task 2, in the **verification script**, not the production code: an early version of the even-split proportional-share test computed its expected value via plain division instead of replicating the real function's `roundHalfUp` step, producing a false failure on an odd `taxPiastres` value. This is exactly the kind of self-check-script bug the story's own Dev Notes warned about avoiding in the *implementation* — worth recording that the verification layer itself isn't immune to the same class of rounding mistake, and needs the same care.
- AC #3's "cannot proceed past it silently" was implemented as an always-tappable Continue button with an inline blocking message on invalid attempts, rather than a disabled button — a disabled RN `Pressable` fires no `onPress` at all, which is arguably *more* silent (nothing happens, no explanation) than a button that responds with "here's what's missing." This is a judgment call, not something the story text mandated one way or the other.
- No automated tests beyond the two verification scripts, consistent with every prior story's Testing Requirements section and Architecture's explicit CI/testing-infrastructure deferral for v1.
- Not verified in a running app (no device/simulator session in this environment) — structural/logical implementation is complete, typechecked, and verified via the scratch/verification scripts; UI layout and touch interaction (chip wrapping with many people/items, keyboard behavior on the add-person field) are unverified by this session.

### File List

**Added:**
- `client/app/domain/assignment.ts`
- `client/scripts/verifyAssignment.ts`
- `client/app/screens/ItemAssignmentScreen.tsx`
- `client/app/screens/ReviewPlaceholderScreen.tsx`

**Modified:**
- `client/app/domain/session.tsx` — added `Person` type, `people`/`itemAssignments` fields on `SplitSession`, `addPerson`/`setItemAssignees` actions; `clearPhoto` now also resets `people`/`itemAssignments`.
- `client/app/screens/TaxServiceScreen.tsx` — added "Continue" control to `ItemAssignment`.
- `client/app/navigation/types.ts` — added `ItemAssignment: undefined` and `ReviewPlaceholder: undefined` routes.
- `client/App.tsx` — registered `ItemAssignmentScreen` and `ReviewPlaceholderScreen`.
