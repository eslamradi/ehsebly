---
baseline_commit: NO_VCS
---

# Story 1.3: Confirm Tax and Service Applicability and Rate

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a fronter,
I want to confirm whether tax and service actually apply to this receipt, and at what rate,
so that the split accounts for exactly what this venue really charges, not an assumed national average.

## Acceptance Criteria

1. Given items have been extracted (Story 1.2) and I tap Continue from the extracted-items screen, When I reach the tax/service confirmation step, Then tax defaults to 14% and service defaults to 12% unless an explicit tax/service line was detected during extraction, in which case that line's rate pre-fills instead — and **each toggle defaults ON only if its corresponding line was actually detected, OFF otherwise** (a receipt with a detected service line but no tax line, for example, starts with service on and tax off). [Source: prd.md#FR-4, #FR-5; epics.md Story 1.3; PRD addendum — SEA SOUL Restaurant finding: "the 'tax applicable' toggle should default to off if no tax line is detected, per FR-4"]
2. Given tax or service is toggled off, When I do so, Then that charge is removed entirely from the computed total — the toggle is not just visual, the total preview recalculates without it. [Source: prd.md#FR-4]
3. Given I edit the tax or service rate value or flip a toggle, When I change it, Then a live total preview (subtotal, service amount, tax amount, total) recalculates immediately using the FR-6 compounding formula — service computed on the item subtotal first, tax computed on the service-inclusive amount, never independently on the raw subtotal. [Source: prd.md#FR-4, #FR-5, #FR-6; ARCHITECTURE-SPINE.md#AD-3]

## Tasks / Subtasks

- [x] Task 1: Add the compounding-calculation pure function to `app/domain/` (AC: #3)
  - [x] New file `client/app/domain/splitCalculation.ts` — `calculateSplitTotals({subtotalPiastres, taxEnabled, taxRatePercent, serviceEnabled, serviceRatePercent})`, returning `{subtotalPiastres, servicePiastres, taxPiastres, totalPiastres}`.
  - [x] Added `roundHalfUp(piastres: number): number` to `client/app/domain/money.ts`, applied to both the service and tax calculations.
  - [x] **Self-check passed**: ran the formula against the Greek Club Cairo worked example in a scratch Node script — reproduced service=2208, tax=2885, total=23493 exactly.
  - [x] Added `parsePercentInput(text: string): number | null` to `money.ts`.
- [x] Task 2: Extend session state with tax/service confirmation settings (AC: #1, #2, #3)
  - [x] Added `taxService: TaxServiceSettings | null` to `SplitSession` plus `setTaxService` (full-object replace). Also extended `clearPhoto()` to clear `taxService` too, so a retake doesn't leave stale rate settings from a previous receipt.
  - [x] No calculation logic added to `session.tsx` — `TaxServiceScreen` calls `calculateSplitTotals` itself.
- [x] Task 3: Add a "Continue" control to `ExtractedItemsScreen` that computes tax/service defaults and navigates forward (AC: #1)
  - [x] Added a "Continue" button implementing the detected-vs-default rule. **Found and fixed a bug during implementation**: the initial version recomputed defaults unconditionally, which would silently wipe out a fronter's manual rate edits if they went Back (e.g. to fix an item price) and tapped Continue again. Fixed by only seeding `taxService` when it's still `null` (first visit only).
  - [x] "Back to Camera" control kept as-is.
- [x] Task 4: Build the tax/service confirmation screen (AC: #1, #2, #3)
  - [x] `client/app/screens/TaxServiceScreen.tsx` created and registered (route added to `RootStackParamList` and `App.tsx`).
  - [x] Two rows (tax, service) using RN's built-in `Switch` + a rate `TextInput` each, draft-then-commit-on-blur editing (same pattern as `ExtractedItemsScreen`'s price fields). The rate input is `editable={false}` while its toggle is off — the fronter turns a charge on before adjusting its rate, keeping the interaction simple; the stored rate value persists either way so turning a charge back on doesn't lose a previously-entered rate.
  - [x] Live preview panel (subtotal/service/tax/total) recalculated on every render via `calculateSplitTotals`, guarded against a non-`'ok'` extraction result or missing `taxService`.
  - [x] "Back" control to `ExtractedItemsScreen` included from the start.
  - [x] No forward "Continue" control added — Story 1.5 doesn't exist yet.

## Dev Notes

- **Where the calculation logic belongs:** this story is the first to add real "split-domain calculation" logic (as opposed to Story 1.2's plumbing/state work), which is exactly the class of code the Structural Seed's `app/domain/` description names explicitly: "compounding calc (AD-2/AD-3), assignment, reconciliation — pure functions, unit-testable without the app shell." Put it in a pure function (`splitCalculation.ts`), not inline in the screen component and not inside `session.tsx` — this is the resolution point for the domain/pure-functions-vs-Context tension flagged in Story 1.1's and carried through Story 1.2's deferred-work notes.
- **Money throughout is integer piastres (AD-3).** `subtotalPiastres` comes from already-integer `pricePiastres` values (Story 1.2 guarantees this at the extraction boundary). The only place real rounding happens in this story is `calculateSplitTotals`'s two rate-multiplication steps — round-half-up, applied consistently, per AD-3.
- **Testing:** No automated test coverage is expected for this story, consistent with Stories 1.1/1.2's own Testing Requirements sections and Architecture's explicit deferral of CI/testing infrastructure for v1 (`ARCHITECTURE-SPINE.md#Deferred`). The worked-reference self-check in Task 1 is a manual substitute — actually compute it by hand or in a scratch script and confirm the pure function reproduces 2208/2885/23493 before considering Task 1 done.
- **Naming:** Match the PRD Glossary exactly — `Tax Rate`, `Service Rate`, `Subtotal` (Consistency Conventions). Code identifiers used here (`taxRatePercent`, `serviceRatePercent`, `subtotalPiastres`) follow the same naming shape Story 1.2 already established for `taxRatePercent`/`serviceRatePercent` on `ExtractionResult` — reuse that vocabulary, don't invent synonyms.
- **Open interpretation question, resolved by assumption — flagging for confirmation:** the epics.md AC says "the preview split recalculates immediately," but "Split" is glossary-defined as each *person's* exact owed amount, and no one has been assigned to items yet at this point in the flow (Story 1.5). This story assumes "preview split" means a receipt-level total preview (subtotal + service + tax = total), not a per-person breakdown, and that the compounding formula should be implemented correctly now rather than showing a naive/wrong number that Story 1.4 silently "fixes" later — since real friend-group testing could happen between stories shipping, and a visibly wrong running total in the interim is a worse outcome than building the (already fully-specified) correct formula slightly ahead of Story 1.4's own dedicated validation story. If this assumption is wrong, Story 1.4 will find the formula already correct and can focus purely on its own worked-example acceptance test rather than building the formula from scratch.

### Project Structure Notes

- New files: `client/app/domain/splitCalculation.ts`, `client/app/screens/TaxServiceScreen.tsx`.
- Modified: `client/app/domain/money.ts` (add `roundHalfUp`, `parsePercentInput`), `client/app/domain/session.tsx` (add `taxService` state + `setTaxService` action), `client/app/screens/ExtractedItemsScreen.tsx` (add Continue control), `client/app/navigation/types.ts` and `client/App.tsx` (register the new route).
- No changes needed to `client/backend/worker/` — this story is entirely client-side (AD-2: split calculation is on-device only; the backend never receives or returns split results).

### References

- [Source: prd.md#FR-4, #FR-5, #FR-6 — tax/service confirmation and compounding requirements]
- [Source: ARCHITECTURE-SPINE.md#AD-2, #AD-3 — client-side split calculation, integer-money rounding rule]
- [Source: ARCHITECTURE-SPINE.md — Structural Seed (`app/domain/` = pure functions)]
- [Source: epics.md Story 1.3 — acceptance criteria this story's ACs are derived from]
- [Source: addendum.md — Tax/Service Compounding Worked Reference (Greek Club Cairo numbers); SEA SOUL Restaurant finding (tax-toggle-off-if-undetected)]
- [Source: 1-2-extract-items-via-vision-llm-proxy.md — previous story's established patterns: draft-then-commit-on-blur input editing, defensive non-`'ok'` guards, every terminal screen needs a way back, `setX(...)` full-object-replace session actions]

## Previous Story Intelligence (from Story 1.2, including its code review)

- **Session state pattern to continue:** full-object-replace actions (`setExtractionResult`, and now `setTaxService`) — screens spread-and-override, `session.tsx` never contains calculation or I/O logic.
- **Editing pattern to reuse, not reinvent:** Story 1.2's code review found that committing a controlled `TextInput`'s parsed value to session state on every keystroke reformats the field mid-typing and makes it impossible to backspace-and-retype. The fix — a local per-field draft, committed (parsed + written to session) only on blur, invalid input discarded rather than committed — is now the established pattern for any editable money/rate field. `TaxServiceScreen`'s rate inputs should use it from the start.
- **Every screen needs a way out.** Story 1.2 shipped `ExtractedItemsScreen` with no way back (a code-review finding, since fixed); don't repeat that here — `TaxServiceScreen` gets a Back control from the moment it's written, not patched in during review.
- **File locations already established:** `client/app/screens/{Capture,ExtractedItems,ExtractionFailed,ManualEntry}Screen.tsx`, `client/app/domain/{session,money}.ts`, `client/app/api/*`, `client/app/navigation/types.ts`, `client/App.tsx`. This story is the first to populate `app/domain/` with calculation logic beyond `money.ts`'s formatting helpers.
- **No git history exists** (`baseline_commit: NO_VCS` in both prior stories) — there is still no commit to diff against; code review for this story will again need to review full file contents rather than an incremental diff, same as Story 1.2's review.
- **Stack versions:** Expo SDK 57.0.7, React Native 0.86.0, React 19.2.3, TypeScript ~6.0.3. `Switch` is available from `react-native` core — no new dependency needed for the toggles.

### Review Findings

Three parallel adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor vs. this story + Architecture Spine + PRD addendum) ran against the full current content of every file in this story's File List (no git history exists yet, same as Story 1.2's review). 28 raw findings collapsed to 20 after merging duplicates across layers: 0 decision-needed, 6 patches, 3 deferred, 11 dismissed as noise/false-positive/handled-elsewhere.

- [x] [Review][Patch] `parsePercentInput` had no upper-bound sanity check — a typo like "140" instead of "14" would silently produce a total 10x too large with no warning. **Fixed**: added `MAX_PERCENT_RATE = 100`; anything above it is rejected like any other malformed input. [client/app/domain/money.ts]
- [x] [Review][Patch] Silent-revert-on-invalid-input gave no user feedback on both `TaxServiceScreen`'s rate fields and `ExtractedItemsScreen`'s price field. **Fixed**: added per-field error state, a red border, and a short inline message ("Couldn't read that price/rate — kept the previous value.") shown when a blur commit is rejected; cleared as soon as the fronter starts typing again. [client/app/screens/TaxServiceScreen.tsx, client/app/screens/ExtractedItemsScreen.tsx]
- [x] [Review][Patch] The detected-vs-default toggle/rate seeding logic lived inline in `ExtractedItemsScreen.handleContinue` rather than as a pure function in `app/domain/`. **Fixed**: extracted `computeInitialTaxServiceSettings()` into `splitCalculation.ts`, alongside the `TaxServiceSettings` type (now imported by `session.tsx` rather than defined there). [client/app/domain/splitCalculation.ts, client/app/domain/session.tsx, client/app/screens/ExtractedItemsScreen.tsx]
- [x] [Review][Patch] `TaxServiceScreen` recomputed the item subtotal via an inline `reduce` rather than a shared helper. **Fixed**: added `calculateSubtotalPiastres()` to `splitCalculation.ts`. [client/app/domain/splitCalculation.ts, client/app/screens/TaxServiceScreen.tsx]
- [x] [Review][Patch] Disabled rate `TextInput`s had no visual disabled styling. **Fixed**: added a `rateInputDisabled` style (grey background/text) applied while the corresponding `Switch` is off. [client/app/screens/TaxServiceScreen.tsx]
- [x] [Review][Patch] Pending price/rate drafts weren't explicitly flushed at transition points. **Fixed**: `ExtractedItemsScreen.handleContinue` now flushes every pending price draft before navigating; `TaxServiceScreen.handleBack` commits both rate drafts before navigating; the `Switch` toggle handlers now resolve any pending rate draft into the same update that flips the toggle, so a switch flip can never leave a stale, uncommitted draft displayed against the newly-toggled state. [client/app/screens/ExtractedItemsScreen.tsx, client/app/screens/TaxServiceScreen.tsx]

- [x] [Review][Defer] Floating-point multiplication in `calculateSplitTotals`'s rate calculations (`(subtotal * rate) / 100`), in tension with `money.ts`'s stated "no floating-point" philosophy elsewhere — deferred, real but extremely low-severity (sub-piastre precision edge case at best); independently verified correct against both PRD addendum worked examples (Greek Club Cairo and the French-menu receipt) including a case requiring round-down on a `.12` fraction. A fully robust fix needs integer-percentage arithmetic more involved than a one-line change. Revisit if Story 1.4's formal acceptance test ever catches a discrepancy. [client/app/domain/splitCalculation.ts:33-38]
- [x] [Review][Defer] UI event handlers (`Switch.onValueChange`, `TextInput.onBlur` in `TaxServiceScreen`) construct full-object-replace session mutations directly, in literal tension with Architecture's Consistency Conventions wording ("mutated only through the split-domain layer, never directly from UI event handlers") — deferred, pre-existing: this is the established pattern every screen in this app has used since Story 1.1 (`setPhoto`, `setExtractionResult`, and now `setTaxService` are all called directly from screens), not a new deviation. Same root tension as Story 1.2 review's dependency-diagram finding. Revisit if the Architecture doc's wording is ever reconciled with actual practice. [client/app/screens/TaxServiceScreen.tsx]
- [x] [Review][Defer] Duplicated button/style boilerplate across screens (`ExtractedItemsScreen`, `TaxServiceScreen`, and prior screens) — deferred, real DRY concern, but a proper fix means introducing a shared `Button` component touching every existing screen, beyond this story's scope. [client/app/screens/TaxServiceScreen.tsx, client/app/screens/ExtractedItemsScreen.tsx]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (via Claude Code)

### Debug Log References

- `cd client && npx tsc --noEmit` — clean at every task boundary, after the Continue-handler bug fix, and after every code-review patch.
- Worked-reference self-check, run twice (before and after the code-review refactor of `splitCalculation.ts`): reproduced both PRD addendum worked examples exactly — Greek Club Cairo (`{subtotalPiastres: 18400, servicePiastres: 2208, taxPiastres: 2885, totalPiastres: 23493}`) and the French-menu receipt (`{subtotalPiastres: 126600, servicePiastres: 15192, taxPiastres: 19851, totalPiastres: 161643}`), the latter independently re-verified by the Acceptance Auditor during code review. No persistent test file created (no test infra exists yet for this project — see Dev Notes).

### Completion Notes List

- Implemented all 4 tasks, then a full code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor) with all 6 patch findings applied and 3 items deferred (logged to `deferred-work.md`). Client project typechecks cleanly with strict mode on throughout. This story touches only `client/` — no Worker changes, consistent with AD-2 (split calculation is entirely on-device).
- The story's own Dev Notes flagged an open interpretation question (whether "preview split" means a receipt-level total or something else) and proceeded on the receipt-level-total assumption, implementing the full FR-6 compounding formula now rather than deferring it to Story 1.4. Both self-checks above confirm the formula is correct against the PRD's own worked reference cases; the Acceptance Auditor independently re-verified the arithmetic during review rather than trusting the self-report.
- One bug found and fixed during initial implementation (before review), not anticipated by the story text: `ExtractedItemsScreen`'s Continue handler originally reseeded `taxService` from extraction defaults on every tap, which would silently discard a fronter's manual rate edits if they navigated Back to fix an item and then tapped Continue again. Fixed by only seeding when `session.taxService` is still `null`.
- Code review found one genuinely incorrect reviewer claim worth recording: Blind Hunter flagged `roundHalfUp`'s `Math.floor(x + 0.5)` as "unsafe for negative inputs" citing "-2.5 should round to -3, not -2." That's wrong for the specific rule this function implements — "round half **up**" (toward +positive infinity, matching AD-3's own naming) correctly gives -2 for -2.5; -3 would be "round half away from zero," a different rule. Also moot since money is never negative in this domain. Dismissed, not patched.
- No automated tests written or run, per this story's own Dev Notes and Stories 1.1/1.2's precedent — consistent with Architecture's explicit deferral of CI/testing infrastructure for v1. The worked-reference self-checks (Debug Log References) are the manual substitute the story itself calls for.
- Not verified in a running app (no device/simulator session in this environment) — structural/logical implementation is complete and typechecked; UI layout and touch interaction (e.g., the Switch/TextInput row layout, keyboard behavior, the new error-state styling) are unverified by this session.

### File List

**Added:**
- `client/app/domain/splitCalculation.ts` — later extended during code review with `calculateSubtotalPiastres()` and `computeInitialTaxServiceSettings()` (see Modified).
- `client/app/screens/TaxServiceScreen.tsx`

**Modified:**
- `client/app/domain/money.ts` — added `parsePercentInput`, `roundHalfUp`. Code review: added an upper-bound check (`MAX_PERCENT_RATE = 100`) to `parsePercentInput`.
- `client/app/domain/session.tsx` — added `taxService` field on `SplitSession`, `setTaxService` action; `clearPhoto` now also clears `taxService`. Code review: `TaxServiceSettings` type now imported from `splitCalculation.ts` instead of defined locally.
- `client/app/screens/ExtractedItemsScreen.tsx` — added "Continue" control (tax/service default computation, one-time seeding) alongside the existing "Back to Camera" control. Code review: uses `computeInitialTaxServiceSettings()` instead of inline logic; added per-row price-error state/styling/message; `handleContinue` now flushes all pending price drafts before navigating.
- `client/app/domain/splitCalculation.ts` — code review: added `calculateSubtotalPiastres()` (shared subtotal helper) and `computeInitialTaxServiceSettings()` + the `TaxServiceSettings` type (moved from `session.tsx`).
- `client/app/screens/TaxServiceScreen.tsx` — code review: uses `calculateSubtotalPiastres()` instead of an inline `reduce`; added per-field rate-error state/styling/message; added disabled-input styling; `Switch` toggle handlers now resolve any pending rate draft into the same update; `handleBack` commits both pending rate drafts before navigating.
- `client/app/navigation/types.ts` — added `TaxService: undefined` route.
- `client/App.tsx` — registered `TaxServiceScreen`.
