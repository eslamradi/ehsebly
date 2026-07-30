---
baseline_commit: NO_VCS
---

# Story 1.6: Review, Edit, and Reconcile Before Finalizing

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a fronter,
I want to review the full split and fix anything OCR misread before it's final,
so that I can trust the numbers enough to actually pay and tell my friends what they owe.

## Acceptance Criteria

1. Given I've assigned all items (Story 1.5), When I reach the review screen, Then I see the full itemized list, confirmed tax/service, assignments, and computed per-person totals in one place. [Source: prd.md#FR-9]
2. Given I spot a misread item name or price on the review screen, When I edit it, Then all downstream per-person totals recalculate immediately. [Source: prd.md#FR-9]
3. Given I have not yet passed through the review screen, When any part of the app attempts to show the split to other people, Then that "final" state is unreachable — review is mandatory, not skippable. [Source: prd.md#FR-9]
4. Given the review screen is showing, When the computed sum of items + tax + service disagrees with the receipt's Printed Total by more than a small rounding tolerance, Then the discrepancy is visibly flagged to the fronter, not silently hidden — and the system does not attempt to auto-correct or force a match. [Source: prd.md#FR-10]

## Tasks / Subtasks

- [x] Task 1: Extend the AD-4 extraction contract (Worker) to capture the receipt's Printed Total (AC: #4)
  - [x] Gap confirmed and closed: `ExtractionResponse`'s `ok` shape only had `items`, `tax_line?`, `service_line?` — added `printed_total_piastres?: number`.
  - [x] `EXTRACT_RECEIPT_TOOL` schema: added top-level `printed_total_text: string | null` (same nullable convention as `tax_line`/`service_line`), added to `required`.
  - [x] `ExtractReceiptToolInput` and `isValidToolInput` updated; added `isValidNullableString` helper for the bare nullable-string check.
  - [x] `extractReceiptViaVisionLLM` parses `printed_total_text` via the existing `parsePrintedPriceToPiastres` (no second parser). Unparseable text or `null` both omit the field from the response (soft failure, `console.error`'d — not a hard extraction failure like item prices).
  - [x] `cd client/backend/worker && npm run typecheck` — clean.
- [x] Task 2: Mirror the contract extension client-side (AC: #4)
  - [x] `client/app/api/types.ts`: added `printedTotalPiastres?: number` to `ExtractionResult`'s `ok` shape.
  - [x] `client/app/api/extractReceipt.ts`: added `printed_total_piastres?: number` to `WorkerResponseBody`, mapped through in `toExtractionResult`.
  - [x] `cd client && npx tsc --noEmit` — clean.
- [x] Task 3: Add reconciliation logic to `app/domain/` (AC: #4)
  - [x] `client/app/domain/reconciliation.ts` created — third piece of the Structural Seed's `app/domain/` trio (compounding calc, assignment, reconciliation).
  - [x] `ReconciliationResult` implemented as a discriminated union (`{status:'match'}` / `{status:'mismatch', diffPiastres}` / `{status:'unknown'}`), matching the AD-4-contract style already used elsewhere in this codebase rather than an optional field on a flat object.
  - [x] `reconcileWithPrintedTotal` implemented — pure, no mutation.
  - [x] `RECONCILIATION_TOLERANCE_PIASTRES = 2` exported with rationale comment.
  - [x] `client/scripts/verifyReconciliation.ts` created: exact-match (both worked examples), off-by-1/off-by-2 (within tolerance), off-by-3 both directions (mismatch, signed `diffPiastres` verified), undefined printed total (`'unknown'`). `npx tsx client/scripts/verifyReconciliation.ts` — 9/9 checks pass. `npx tsc --noEmit` — clean.
- [x] Task 4: Build the real review screen (AC: #1, #2, #3, #4)
  - [x] `client/app/screens/ReviewScreen.tsx` created (placeholder deleted in Task 5).
  - [x] Itemized list, editable: name plain immediate-commit, price draft-commit-on-blur with error banner — identical pattern to `ExtractedItemsScreen.tsx`.
  - [x] Confirmed tax/service: read-only summary lines (rate + amount, or "(off)"), sourced from `taxService`/`calculateSplitTotals`. Not editable here.
  - [x] Assignments: read-only assignee-name list per item, looked up from `people`/`itemAssignments`. Not editable here.
  - [x] Per-person totals: `calculatePersonSubtotals`/`calculatePersonTotals` called fresh every render — editing an item recalculates everything downstream automatically via the existing full-object-replace pattern, no extra plumbing needed.
  - [x] Printed Total reconciliation banner: `reconcileWithPrintedTotal` called with `RECONCILIATION_TOLERANCE_PIASTRES`; three distinct visual states (match/mismatch/unknown) implemented via a `ReconciliationBanner` sub-component.
  - [x] Back to `ItemAssignment`, "Confirm split" to `FinalSplitPlaceholder`, both present from the start.
- [x] Task 5: Add a minimal final-split placeholder screen and wire navigation (AC: #3)
  - [x] `client/app/screens/FinalSplitPlaceholderScreen.tsx` created, same honest-stub pattern as `ManualEntryScreen`.
  - [x] `client/app/navigation/types.ts`: `ReviewPlaceholder` removed, `Review` and `FinalSplitPlaceholder` added.
  - [x] `client/App.tsx`: `ReviewPlaceholderScreen` deregistered and deleted; `ReviewScreen` (as `Review`) and `FinalSplitPlaceholderScreen` registered.
  - [x] `client/app/screens/ItemAssignmentScreen.tsx`: Continue now navigates to `Review`.
  - [x] AC #3 satisfied structurally by the linear navigation graph — no other route reaches a split-displaying screen without passing through `Review` first; no separate flag needed at this scope (documented reasoning carried over from the story's Dev Notes).
  - [x] `cd client && npx tsc --noEmit` and `cd client/backend/worker && npm run typecheck` both clean. All three verification scripts (`verifySplitCalculation.ts`, `verifyAssignment.ts`, `verifyReconciliation.ts`) re-run with no regressions.

### Review Findings

- [x] [Review][Patch] `updateItemName` in `ReviewScreen.tsx` has no validation — a blank/whitespace-only name commits immediately with no error feedback, unlike the price field two lines below it [client/app/screens/ReviewScreen.tsx]
- [x] [Review][Patch] `verifyReconciliation.ts` has thin edge-case coverage — add zero-vs-zero and larger-piastre-value checks [client/scripts/verifyReconciliation.ts]
- [x] [Review][Defer] `isValidRateLine` in `extract.ts` has no bounds/sanity check on `rate_percent` — accepts `NaN`, `Infinity`, negative values, or values over 100, which flow uncapped into `calculateSplitTotals` [client/backend/worker/src/extract.ts] — deferred, pre-existing from Story 1.2, flagged HIGH for likely dedicated fix
- [x] [Review][Defer] No way to add or remove a line item on the Review screen — real gap for an OCR-hallucinated/missing item, but not required by FR-9's literal "edit any item's name or price" text [client/app/screens/ReviewScreen.tsx] — deferred
- [x] [Review][Defer] `extract.ts` doesn't distinguish a Messages API content-policy refusal (`stop_reason: "refusal"`) from a generic malformed response [client/backend/worker/src/extract.ts] — deferred, pre-existing from Story 1.2
- [x] [Review][Defer] Client's local `fetch(photoUri)` isn't covered by the 30s abort timeout, and its response is never `.ok`-checked before `.blob()` [client/app/api/extractReceipt.ts] — deferred, pre-existing from Story 1.2/1.3
- [x] [Review][Defer] Client trusts the Worker's response body via a type-cast with no runtime shape validation, unlike the Worker's own defense-in-depth validation of the vision-LLM response [client/app/api/extractReceipt.ts] — deferred, pre-existing from Story 1.2
- [x] [Review][Defer] `RECONCILIATION_TOLERANCE_PIASTRES = 2` may be too tight for receipts with many items — worth reconsidering during the 10-dinner test [client/app/domain/reconciliation.ts] — deferred, already a disclosed `[ASSUMPTION]`, not a bug
- [x] [Review][Defer] No extra confirmation step or visual distinction between "Back" and "Confirm split" when reconciliation status is `mismatch` [client/app/screens/ReviewScreen.tsx] — deferred, UX polish beyond what any AC requires
- [x] [Review][Defer] `ARCHITECTURE-SPINE.md`'s AD-4 rule text doesn't mention `printed_total_piastres` — documentation drift, not a code defect [ARCHITECTURE-SPINE.md] — deferred

## Dev Notes

- **The Printed Total gap is the load-bearing risk in this story, not the review screen's UI.** Everything in Task 4 is a straightforward extension of patterns already proven in `ExtractedItemsScreen.tsx`/`TaxServiceScreen.tsx`/`ItemAssignmentScreen.tsx`. Tasks 1-3 are new ground: extending a contract that's been stable since Story 1.2, across both the Worker and the client, following the **exact same transcribe-text-then-deterministically-parse** discipline Story 1.2's code review already established for item prices (`price_egp_text` → `parsePrintedPriceToPiastres`) — do not have the model do arithmetic or return a pre-converted integer; that was explicitly rejected once already (Story 1.2 DN1) for the same reason it would be wrong here: a silent model conversion error undermines SM-2's zero-mismatch success bar.
- **Failure mode to get right:** an undetected/illegible Printed Total must degrade to `'unknown'`, never to a false `'match'` or false `'mismatch'`. A missing value is not the same as a value of `0`, and must not be coerced to one anywhere in the pipeline (Worker response omits the field entirely rather than sending `0` or `null` for "not found" — mirrors how `tax_line`/`service_line` already handle "not detected").
- **Reconciliation compares receipt-level totals, not summed per-person totals.** `reconcileWithPrintedTotal` takes `totals.totalPiastres` (from `calculateSplitTotals`) directly — it has nothing to do with `calculatePersonTotals`'s per-person rounding tolerance (Story 1.5's Dev Notes already drew this exact distinction: item-split exactness vs. per-person proportional-share tolerance vs. — now — this third, different comparison against the *printed* total). Don't conflate the three.
- **Editing at Review needs no new state-management pattern.** `setExtractionResult` already triggers a full session update and re-render; `ReviewScreen` reads `session.extractionResult.items` fresh every render just like every other screen. There is no caching layer anywhere in this codebase to invalidate.
- **Scope boundary, stated plainly:** this story's editable surface is item name/price only (FR-9's literal text). Tax/service rate and item assignment are both already editable elsewhere (Story 1.3, Story 1.5) and are intentionally read-only summaries here — resist the urge to make everything editable from one screen; that's scope creep beyond what FR-9 asks for.
- **No automated test framework** — same situation as every prior story. `client/scripts/verifyReconciliation.ts` follows the established pattern exactly: plain functions, hand-rolled `assertEqual`, run via `npx tsx` not plain `node`.
- **Naming:** PRD Glossary defines "Printed Total" explicitly ("The receipt's final printed total; the reconciliation ground truth (FR-10)") — use that exact term in UI copy and code (`printedTotalPiastres`, not e.g. `receiptTotal`).
- **Testing:** No automated test coverage beyond the verification script, consistent with every prior story's Testing Requirements section and Architecture's explicit CI/testing-infrastructure deferral for v1.

### Project Structure Notes

- New files: `client/app/domain/reconciliation.ts`, `client/scripts/verifyReconciliation.ts`, `client/app/screens/ReviewScreen.tsx`, `client/app/screens/FinalSplitPlaceholderScreen.tsx`.
- Deleted: `client/app/screens/ReviewPlaceholderScreen.tsx` (superseded by `ReviewScreen.tsx`).
- Modified: `client/backend/worker/src/types.ts`, `client/backend/worker/src/extract.ts` (Printed Total in the AD-4 contract), `client/app/api/types.ts`, `client/app/api/extractReceipt.ts` (client-side mirror), `client/app/navigation/types.ts`, `client/App.tsx` (route swap), `client/app/screens/ItemAssignmentScreen.tsx` (one-line navigate-target change).
- This is the first story since 1.2 to touch the Worker — run both typecheck commands (`cd client && npx tsc --noEmit` and `cd client/backend/worker && npm run typecheck`), not just the client one.

### References

- [Source: prd.md#FR-9, #FR-10 — review/edit and printed-total reconciliation requirements]
- [Source: prd.md#Glossary — "Printed Total" exact term]
- [Source: ARCHITECTURE-SPINE.md#AD-2, #AD-3, #AD-4 — client-side split logic, integer-money rounding rule, extraction contract this story extends]
- [Source: ARCHITECTURE-SPINE.md — Structural Seed (`app/domain/` = "compounding calc, assignment, **reconciliation**" — this story builds the third piece)]
- [Source: epics.md Story 1.6 — acceptance criteria this story's ACs are derived from]
- [Source: 1-2-extract-items-via-vision-llm-proxy.md — transcribe-text-then-deterministically-parse pattern (DN1) this story's Printed Total field follows exactly]
- [Source: 1-5-assign-items-to-people-including-shared-items.md — exactness-vs-tolerance distinction this story adds a third category to; verification-script pattern]

## Previous Story Intelligence (from Stories 1.2-1.5)

- **Session state pattern:** full-object/array-replace actions — screens spread-and-override, `session.tsx` never contains calculation logic. No new session actions are needed for this story (editing items already goes through the existing `setExtractionResult`).
- **Editing pattern:** price fields use draft-then-commit-on-blur with visible error feedback (Story 1.3's code review finding); fields with no display-reformatting (item name, Story 1.5's person-name field) use plain immediate-commit instead — apply the same judgment call to `ReviewScreen`'s fields rather than blanket-applying one pattern to both.
- **Every screen needs a Back control from the moment it's written**, not patched in during review (Story 1.2's code review lesson, followed cleanly in every story since).
- **Verification-script pattern established in Story 1.4, extended in 1.5:** plain functions, no framework, imported from the real production module, run via `npx tsx` (not plain `node` — see Story 1.4's Dev Agent Record for the exact module-resolution reason), asserting via a tiny hand-rolled `assertEqual` + exit-code convention.
- **`calculateSplitTotals`** (`client/app/domain/splitCalculation.ts`) returns `{subtotalPiastres, servicePiastres, taxPiastres, totalPiastres}` — this story's reconciliation consumes `totalPiastres` directly.
- **`calculatePersonSubtotals`/`calculatePersonTotals`** (`client/app/domain/assignment.ts`) — this story's per-person total display reuses both exactly as `ItemAssignmentScreen` already does, no new person-total logic needed.
- **No git history exists** (`baseline_commit: NO_VCS`) — still true; code review for this story will again need to review full file contents, not an incremental diff.
- **Stack versions:** Expo SDK 57.0.7, React Native 0.86.0, React 19.2.3, TypeScript ~6.0.3, Node v25.2.1.
- **Code review has been deferred across Stories 1.4 and 1.5 per explicit user instruction** ("move to next story and make code review last thing") — both are sitting in `review` status un-reviewed. This is intentional, not an oversight; do not be surprised if this story is also implemented before either of those receive review.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (via Claude Code)

### Debug Log References

- `cd client/backend/worker && npm run typecheck` — clean after Task 1 and again at final validation.
- `cd client && npx tsc --noEmit` — clean after Tasks 2, 4, 5 and at final validation.
- `npx tsx client/scripts/verifyReconciliation.ts` — 9/9 checks pass.
- `npx tsx client/scripts/verifySplitCalculation.ts` — 18/18 checks still pass (no regression).
- `npx tsx client/scripts/verifyAssignment.ts` — 17/17 checks still pass (no regression).

### Completion Notes List

- Implemented all 5 tasks. Both TypeScript projects (client and Worker) typecheck cleanly with strict mode on.
- The story's own Dev Notes flagged the real risk correctly: the Printed Total wasn't captured anywhere in the AD-4 contract before this story. Closed that gap first (Tasks 1-2) by extending the extraction contract with a `printed_total_text` → `printed_total_piastres` field, following the exact transcribe-then-deterministically-parse discipline Story 1.2 already established for item prices (reused `parsePrintedPriceToPiastres` as-is, no second parser written). Unlike item prices, a bad/missing Printed Total transcription is a soft failure (field omitted, not a whole-extraction error) since it's a reconciliation nice-to-have, not a required value.
- `reconcileWithPrintedTotal` is a three-state discriminated union (`match`/`mismatch`/`unknown`) rather than a boolean + optional diff, matching the AD-4-contract style already established elsewhere in this codebase (e.g. `ExtractionResult`) and making the "no printed total detected" case impossible to confuse with a real match.
- `RECONCILIATION_TOLERANCE_PIASTRES = 2` implemented exactly as scoped in the story — a disclosed `[ASSUMPTION]`, not a spec value, since the PRD only says "small rounding tolerance" with no number.
- `ReviewScreen` reuses `ExtractedItemsScreen`'s editing pattern verbatim (same variable names/shapes for `priceDrafts`/`priceErrors`) rather than inventing a new one — kept intentional rather than accidental duplication, since the two screens are independent per the Structural Seed's screen-per-FR organization and there's no shared "editable item row" component yet at this scope.
- Confirmed via the story's own reasoning that AC #3 ("review is mandatory") needs no new session flag: the navigation graph is linear and `FinalSplitPlaceholder` has no route into it other than `Review`'s Confirm button. Verified this by grep — `FinalSplitPlaceholder` appears only in `App.tsx`'s registration and `ReviewScreen.tsx`'s single `navigate` call.
- No automated tests beyond the three verification scripts (one new, two re-confirmed with no regression), consistent with every prior story's Testing Requirements section and Architecture's explicit CI/testing-infrastructure deferral for v1.
- Not verified in a running app (no device/simulator session in this environment) — structural/logical implementation is complete, typechecked, and verified via the scratch/verification scripts; UI layout (the reconciliation banner's three visual states, item-row wrapping with many items) is unverified by this session.

### File List

**Added:**
- `client/app/domain/reconciliation.ts`
- `client/scripts/verifyReconciliation.ts`
- `client/app/screens/ReviewScreen.tsx`
- `client/app/screens/FinalSplitPlaceholderScreen.tsx`

**Deleted:**
- `client/app/screens/ReviewPlaceholderScreen.tsx` (superseded by `ReviewScreen.tsx`)

**Modified:**
- `client/backend/worker/src/types.ts` — added `printed_total_piastres?: number` to `ExtractionResponse`'s `ok` shape.
- `client/backend/worker/src/extract.ts` — added `printed_total_text` to the tool schema/input type/validation, and parsing logic in `extractReceiptViaVisionLLM`.
- `client/app/api/types.ts` — added `printedTotalPiastres?: number` to `ExtractionResult`'s `ok` shape.
- `client/app/api/extractReceipt.ts` — mirrored the new field through `WorkerResponseBody`/`toExtractionResult`.
- `client/app/navigation/types.ts` — replaced `ReviewPlaceholder` with `Review` and `FinalSplitPlaceholder`.
- `client/App.tsx` — deregistered `ReviewPlaceholderScreen`, registered `ReviewScreen` and `FinalSplitPlaceholderScreen`.
- `client/app/screens/ItemAssignmentScreen.tsx` — Continue now navigates to `Review`.
