---
baseline_commit: NO_VCS
---

# Story 1.7: Display Final Split

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a fronter,
I want to see each person's exact final amount clearly,
so that I can tell them what they owe or show them my screen directly.

## Acceptance Criteria

1. Given the split has been reviewed and confirmed (Story 1.6), When I view the final split screen, Then each person's line shows their amount and makes clear it includes their share of tax/service — not a bare number with no context. [Source: prd.md#FR-11]
2. Given the final split is displayed, When I look for any way to pay someone through the app, Then no such option exists anywhere in the app — hasebly never integrates a payment rail or moves money on behalf of any user. [Source: prd.md#FR-12]

## Tasks / Subtasks

- [x] Task 1: Build the final split screen (AC: #1)
  - [x] `client/app/screens/FinalSplitScreen.tsx` created; placeholder deleted (Task 3).
  - [x] Totals recomputed on render exactly as `ReviewScreen.tsx` does — no caching, no navigation-param passing.
  - [x] Per-person line: name + amount + context line via `describeIncludedCharges(taxEnabled, serviceEnabled)`, branching on actual toggle state (both/tax-only/service-only/neither) rather than always claiming both charges are included.
  - [x] "Back" to `Review`, present from the start.
  - [x] Defensive guard matches every other screen's pattern (missing `extractionResult`/`taxService` → "Nothing to show yet" + Back).
- [x] Task 2: Verify the no-payment constraint (AC #2)
  - [x] Grepped `FinalSplitScreen.tsx` and the whole `client/app` tree (plus `package.json`) for payment-related terms (pay/InstaPay/Vodafone Cash/Stripe/PayPal/checkout/bank) — no matches except the doc comment noting the absence. No payment button, link, or SDK exists anywhere in the app.
- [x] Task 3: Wire navigation (AC: #1)
  - [x] `client/app/navigation/types.ts`: `FinalSplitPlaceholder` replaced with `FinalSplit`.
  - [x] `client/App.tsx`: `FinalSplitPlaceholderScreen` deregistered and deleted; `FinalSplitScreen` registered as `FinalSplit`.
  - [x] `client/app/screens/ReviewScreen.tsx`: Confirm now navigates to `FinalSplit`.
  - [x] `cd client && npx tsc --noEmit` and `cd client/backend/worker && npm run typecheck` both clean. All three verification scripts (`verifySplitCalculation.ts`, `verifyAssignment.ts`, `verifyReconciliation.ts`) re-run with no regressions.

### Review Findings

- [x] [Review][Patch] `describeIncludedCharges` returns `null` when both tax and service are toggled off, rendering a bare amount with no context — violates AC #1's explicit "not a bare number with no context" requirement [client/app/screens/FinalSplitScreen.tsx]
- [x] [Review][Defer] `FinalSplitScreen` shows no grand total / sum-check across all people [client/app/screens/FinalSplitScreen.tsx] — deferred, not required by any AC
- [x] [Review][Defer] No app-level error boundary in `App.tsx` — an unhandled render exception crashes to a blank screen with no fallback UI [client/App.tsx] — deferred, first-time-flagged, low priority at this app's scale

## Dev Notes

- **This is the last story in Epic 1.** After this story, FR-1 through FR-11 are all built; FR-12 is verified as an intentional absence (Task 2). This does not by itself move `epic-1` to `done` in `sprint-status.yaml` — that only happens once every story (including 1.4, 1.5, 1.6, currently sitting in `review` per the user's explicit "make code review last thing" instruction) reaches `done`, which requires running the deferred code reviews first.
- **No new domain logic needed.** Every calculation this screen needs (`calculateSplitTotals`, `calculatePersonSubtotals`, `calculatePersonTotals`) already exists and is already exercised by `ReviewScreen.tsx`. This story is UI-only — resist the urge to add a new `app/domain/` file; there is nothing left to compute that isn't already computed.
- **Resist scope creep beyond the two ACs.** No "start a new split" / "reset session" action is requested by any AC or FR, and the PRD's own Non-Goals (§5) describe hasebly as "a single-session, one-receipt-at-a-time tool, by design, not just for v1" — do not add a reset/restart affordance here; if the fronter wants to split another receipt, the existing `CaptureScreen`/`clearPhoto` flow already exists app-wide (accessible via repeated Back navigation) and needs nothing new. If this friction turns out to matter during the 10-dinner test, that's a signal for a future story, not something to build ahead of being asked.
- **Context-per-line phrasing must reflect actual toggle state, not assume both charges are always on.** Story 1.3 already established that tax and service are independently toggleable and can both be off (e.g. the SEA SOUL Restaurant spike finding — service-only, no tax). A person's line claiming "includes tax and service" when tax was toggled off would be a factually wrong statement on the one screen whose entire job is to be trustworthy enough to relay verbally (this story's own "So that" clause). Branch the copy on `taxService.taxEnabled`/`serviceEnabled`.
- **No automated test framework** — same situation as every prior story. This story has no new pure functions to verify (Task 1 note above), so unlike Stories 1.4-1.6 there is no new verification script to write; re-running the three existing ones (`verifySplitCalculation.ts`, `verifyAssignment.ts`, `verifyReconciliation.ts`) to confirm no regression is still expected as part of Task 3's validation, since this story's navigation/route changes touch files those scripts don't cover but the underlying calculations they exercise are what this screen displays.
- **Naming:** PRD Glossary term is "Split" ("The final computed output: each person's exact owed amount for one receipt.") — use it in UI copy/headings where natural, consistent with every other screen using Glossary terms exactly (Fronter, Item, Assignment, Subtotal, Printed Total already appear verbatim elsewhere in this codebase's UI copy).
- **Testing:** No automated test coverage beyond re-confirming the existing verification scripts still pass, consistent with every prior story's Testing Requirements section and Architecture's explicit CI/testing-infrastructure deferral for v1.

### Project Structure Notes

- New files: `client/app/screens/FinalSplitScreen.tsx`.
- Deleted: `client/app/screens/FinalSplitPlaceholderScreen.tsx` (superseded).
- Modified: `client/app/navigation/types.ts`, `client/App.tsx` (route swap), `client/app/screens/ReviewScreen.tsx` (one-line navigate-target change).
- No Worker changes — this story is entirely client-side UI (AD-2: FR-11's display logic lives in `app/screens` per the Capability → Architecture Map, with no new `app/domain` governance needed).

### References

- [Source: prd.md#FR-11, #FR-12 — final split display and no-payment-integration requirements]
- [Source: prd.md#Glossary — "Split" exact term]
- [Source: prd.md#5 Non-Goals — "single-session, one-receipt-at-a-time tool, by design" (scope boundary for this story)]
- [Source: prd.md addendum — SEA SOUL Restaurant finding (service-only, no tax) — why toggle-state-aware copy matters]
- [Source: ARCHITECTURE-SPINE.md — Capability → Architecture Map: "FR-11 Display final split | `app/screens` | —" and "FR-12 No in-app payment movement | (absence — no module exists for this) | AD-1"]
- [Source: epics.md Story 1.7 — acceptance criteria this story's ACs are derived from]
- [Source: 1-6-review-edit-and-reconcile-before-finalizing.md — the placeholder-replacement pattern (`FinalSplitPlaceholderScreen` → `FinalSplitScreen`) this story follows exactly, same as 1.6 replaced `ReviewPlaceholderScreen`]

## Previous Story Intelligence (from Stories 1.2-1.6)

- **Session state pattern:** full-object/array-replace actions — no new session actions needed for this story; it only reads `session`.
- **Every screen needs a Back control from the moment it's written**, not patched in during review (Story 1.2's code review lesson, followed cleanly in every story since).
- **`calculateSplitTotals`** (`client/app/domain/splitCalculation.ts`) returns `{subtotalPiastres, servicePiastres, taxPiastres, totalPiastres}`.
- **`calculatePersonSubtotals`/`calculatePersonTotals`** (`client/app/domain/assignment.ts`) — this story's per-person display reuses both exactly as `ReviewScreen`/`ItemAssignmentScreen` already do.
- **Story 1.6 just extended the AD-4 contract** with `printedTotalPiastres` and added `app/domain/reconciliation.ts` — not directly relevant to this story's display (that's `ReviewScreen`'s concern), but be aware `session.extractionResult` now carries that field too.
- **Placeholder-replacement pattern, established in 1.5 and repeated in 1.6:** a story that needs a landing screen for a Continue/Confirm action one story ahead of where that screen is really built adds an honest stub (`ManualEntryScreen` precedent); the story that actually owns that screen deletes the placeholder and replaces it with the real thing, updating the one navigation call site that pointed at it. This story is the second (and, per the current epic's story list, final) time this pattern completes.
- **No git history exists** (`baseline_commit: NO_VCS`) — still true; code review for this story will again need to review full file contents, not an incremental diff.
- **Stack versions:** Expo SDK 57.0.7, React Native 0.86.0, React 19.2.3, TypeScript ~6.0.3, Node v25.2.1.
- **Code review has been deferred across Stories 1.4, 1.5, and 1.6 per explicit user instruction** ("move to next story and make code review last thing") — all three are sitting in `review` status un-reviewed. This is intentional, not an oversight; do not be surprised if this story is also implemented before any of those receive review.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (via Claude Code)

### Debug Log References

- `cd client && npx tsc --noEmit` — clean.
- `cd client/backend/worker && npm run typecheck` — clean (unaffected; no Worker changes in this story).
- `npx tsx client/scripts/verifySplitCalculation.ts` — 18/18 checks pass (no regression).
- `npx tsx client/scripts/verifyAssignment.ts` — 17/17 checks pass (no regression).
- `npx tsx client/scripts/verifyReconciliation.ts` — 9/9 checks pass (no regression).
- `grep -inE "pay|instapay|vodafone|stripe|paypal|checkout|bank" client/app/screens/FinalSplitScreen.tsx` and a repo-wide `grep -rniE "instapay|vodafone.?cash|stripe|paypal" client/app client/package.json` — both confirm no payment code exists anywhere in the app (AC #2).

### Completion Notes List

- Implemented all 3 tasks. Both TypeScript projects typecheck cleanly with strict mode on. This story added no new `app/domain` logic — every calculation `FinalSplitScreen` needs already existed and is already exercised by `ReviewScreen`, so this was a UI-only story as anticipated in Dev Notes.
- AC #1's "not a bare number with no context" requirement was implemented via `describeIncludedCharges`, which branches on `taxService.taxEnabled`/`serviceEnabled` rather than always asserting "includes tax and service" — a receipt with only service enabled (or neither) gets accurate copy, not a blanket claim. This directly follows the story's own Dev Notes warning about the SEA SOUL Restaurant spike finding (service-only, no tax receipts are real).
- AC #2 (no payment integration) was a verify-by-construction task, not a build task — confirmed via grep across the screen file and the whole client app tree plus `package.json`, finding zero payment-related code. This is Epic 1's last story; FR-1 through FR-11 are now all built, and FR-12 is verified as an intentional absence.
- Did not add a "start new split" / reset action — explicitly out of scope per the story's Dev Notes (PRD's own Non-Goals describe hasebly as single-session by design); the existing `CaptureScreen`/`clearPhoto` flow already covers this need without any new code.
- `epic-1` remains `in-progress` in `sprint-status.yaml`, not `done` — Stories 1.4, 1.5, and 1.6 are still sitting in `review` status pending the user's deferred code-review pass, and epic completion requires every story to individually reach `done` first.
- No automated tests beyond re-confirming the three existing verification scripts still pass (no new pure functions were added in this story), consistent with every prior story's Testing Requirements section and Architecture's explicit CI/testing-infrastructure deferral for v1.
- Not verified in a running app (no device/simulator session in this environment) — structural/logical implementation is complete and typechecked; UI layout is unverified by this session.

### File List

**Added:**
- `client/app/screens/FinalSplitScreen.tsx`

**Deleted:**
- `client/app/screens/FinalSplitPlaceholderScreen.tsx` (superseded by `FinalSplitScreen.tsx`)

**Modified:**
- `client/app/navigation/types.ts` — replaced `FinalSplitPlaceholder` with `FinalSplit`.
- `client/App.tsx` — deregistered `FinalSplitPlaceholderScreen`, registered `FinalSplitScreen`.
- `client/app/screens/ReviewScreen.tsx` — Confirm now navigates to `FinalSplit`.
