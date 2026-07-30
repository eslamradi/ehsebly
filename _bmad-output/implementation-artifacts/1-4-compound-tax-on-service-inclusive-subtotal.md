---
baseline_commit: NO_VCS
---

# Story 1.4: Compound Tax on Service-Inclusive Subtotal

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a fronter,
I want the tax to be calculated correctly relative to the service charge,
so that hasebly's total actually matches what the restaurant printed, not a naive flat sum.

## Acceptance Criteria

1. Given both tax and service apply to a receipt with subtotal S, service rate r_s, and tax rate r_t, When the split is calculated, Then service = S × r_s, tax = (S + service) × r_t, and total = S + service + tax — tax compounds on the service-inclusive amount, not independently on the raw subtotal. [Source: prd.md#FR-6]
2. Given the Greek Club Cairo reference case (S=184.00, r_s=12%, r_t=14%), When the calculation runs, Then it produces service=22.08, tax=28.85, total=234.93, matching the printed receipt exactly. [Source: prd.md#FR-6 worked example]
3. Given any money value anywhere in this calculation, When it is stored or computed, Then it is represented as an integer minor currency unit (piastres) with round-half-up applied consistently — never a floating-point value. [Source: prd.md#NFR2; ARCHITECTURE-SPINE.md#AD-3]

## Dev Notes — read this before touching any code

**This story's compounding formula already exists and is already correct.** Story 1.3 ("Confirm Tax and Service Applicability and Rate") built `calculateSplitTotals()` in `client/app/domain/splitCalculation.ts` implementing exactly the formula AC #1 describes, because a live total preview on that story's confirmation screen needed it — and that story's own Dev Notes explicitly flagged this possibility: *"If this assumption is wrong, Story 1.4 will find the formula already correct and can focus purely on its own worked-example acceptance test rather than building the formula from scratch."* That's exactly the situation here.

**What's already verified (do not re-derive, just confirm):**
- AC #2's exact worked case (S=18400 piastres, service=2208, tax=2885, total=23493) — reproduced during Story 1.3's implementation and independently re-verified by that story's code review (a separate agent recomputed it from the spec, not from trusting the story's self-report).
- A second real worked example from the PRD addendum (French-menu receipt: subtotal=126600 → service=15192, tax=19851, total=161643) — also independently verified during Story 1.3's review.
- Both checks were done via scratch, throwaway verification (a `node -e` one-liner run manually in the terminal) — **not** persisted anywhere in the repo. That's this story's real gap: AC #2's "when the calculation runs, then it produces..." wording asks for a *repeatable, checkable* proof, not a one-time developer assertion. **This story's job is to make that verification durable, not to write the formula.**

**One real open item Story 1.3's review deliberately deferred to this story:** `calculateSplitTotals` computes `(subtotalPiastres * ratePercent) / 100` using ordinary JavaScript floating-point arithmetic, in tension with AC #3's "never a floating-point value" and with `money.ts`'s stated (for a different function) "no floating-point multiplication" philosophy. Story 1.3's review found this low-risk but explicitly punted: *"Revisit if Story 1.4's formal acceptance test ever catches a discrepancy."* This story is that formal test. Two possible outcomes, and Task 2 below tells you how to tell which one you're in:
  - If exhaustive verification finds **zero** discrepancies across the realistic subtotal/rate domain (see Task 2's method) — the deferred concern is closed. Document that in `deferred-work.md` and do not rearchitect the arithmetic; introducing BigInt/integer-only percentage math for a risk that empirically doesn't manifest would be over-engineering relative to demonstrated need, and every real-world rate in the PRD's OCR spike data is a whole-number percentage (10%, 12%, 14%) — the theoretical risk is already about as low as it gets.
  - If it finds **any** discrepancy — that's a real AD-3 violation and must be fixed (rework the multiplication to avoid the float step, e.g. by scaling the rate to an integer and using exact division with an explicit round-half-up step). Do not ship a known-wrong case.

**AC #3's "integer, never floating-point" applies to stored/returned values, which are already compliant** — `roundHalfUp()` always returns a whole number via `Math.floor`, and every field on `SplitCalculationResult` is that whole-number output. The floating-point question above is about an *intermediate* computation step, not the stored representation.

### No automated test framework exists for this project (Architecture's explicit v1 deferral)

There is no jest/vitest/etc. installed anywhere in this repo, and Architecture explicitly defers CI/testing infrastructure for v1. Do **not** add one just for this story. Instead, write a **standalone verification script** — plain, dependency-free, runnable via `node` directly against the real exported function (not a reimplementation of the formula) — that a human can re-run on demand. This is a script, not a test suite: no framework, no runner config, no CI wiring. This environment's Node (v25.2.1) runs `.ts` files directly with no flags or extra dependencies (`node path/to/script.ts` just works) — confirmed by hand before writing this story. If the environment actually implementing this story has an older Node that can't do that, fall back to `npx tsx path/to/script.ts` (zero-install, no `package.json` change needed) and note that in the script's header comment.

## Tasks / Subtasks

- [x] Task 1: Write a durable verification script proving AC #1/#2 (AC: #1, #2)
  - [x] `client/scripts/verifySplitCalculation.ts` created — imports `calculateSplitTotals` from `../app/domain/splitCalculation` (the real production function) and asserts: Greek Club Cairo (AC #2), the French-menu receipt case, and three degenerate cases (both disabled, tax-only computes on the raw subtotal, service-only leaves tax at 0).
  - [x] On failure: prints expected vs. actual per check and exits non-zero. On success: prints "All N checks passed." and exits 0.
  - [x] `client/scripts/` created as a new top-level directory under `client/`, sibling to `app/` and `backend/`. Typechecks cleanly under `npx tsc --noEmit` from `client/`.
  - [x] Ran the script and confirmed all checks pass — **with one correction to the story's own assumption**: plain `node client/scripts/verifySplitCalculation.ts` does NOT work as this story predicted, despite Node v25.2.1's native `.ts` support. The script's extensionless import (`from '../app/domain/splitCalculation'`) follows the project's `moduleResolution: "bundler"` convention (same as every other file in the app), which Node's own ESM loader can't resolve — it requires an explicit extension, and adding one breaks `tsc --noEmit` instead (`TS5097`, since `allowImportingTsExtensions` isn't enabled project-wide). Fixed by running via `npx tsx client/scripts/verifySplitCalculation.ts` instead (zero-install, no `package.json` change) — documented prominently in the script's own header comment so this isn't rediscovered the hard way later.
- [x] Task 2: Extend the script to formally close the deferred floating-point question (AC: #3)
  - [x] Added the exhaustive sweep: every integer subtotal 1–300,000 piastres × every rate 0–100% in 0.25% steps (120,300,000 combinations) compared against exact `BigInt` rational arithmetic.
  - [x] Result: 0 mismatches. Script prints this explicitly. Updated the corresponding `deferred-work.md` entry (from Story 1.3's review) to mark it resolved, pointing at this script as the evidence.
  - [x] (N/A — no mismatch found, so the "fix the arithmetic" branch of this subtask wasn't needed.)
- [x] Task 3: Audit — confirm no functional code changes are needed, or make them if a real gap is found (AC: #1, #2, #3)
  - [x] Re-read `calculateSplitTotals` against AC #1 line by line — matches exactly. No change made.
  - [x] Confirmed `roundHalfUp()` in `money.ts` is still the only rounding function applied to this calculation (`grep` for rounding logic across `client/app` found exactly one implementation).
  - [x] No discrepancy found in Task 1 or Task 2 — nothing to fix.

### Review Findings

- [x] [Review][Patch] Floating-point sweep never exercises the tax-rate multiplication path — only service [client/scripts/verifySplitCalculation.ts:126-181]
- [x] [Review][Patch] No persisted evidence the 120.3M-combination run was actually executed [_bmad-output/implementation-artifacts/deferred-work.md]
- [x] [Review][Defer] `calculateSplitTotals` has no guard against negative/over-100% rates or negative subtotals [client/app/domain/splitCalculation.ts] — deferred, pre-existing
- [x] [Review][Defer] Verification script header hardcodes an ephemeral environment fact ("this environment's Node v25.2.1") [client/scripts/verifySplitCalculation.ts] — deferred, pre-existing

## Previous Story Intelligence (from Story 1.3, including its code review)

- **`calculateSplitTotals` signature** (`client/app/domain/splitCalculation.ts`): `calculateSplitTotals({subtotalPiastres, taxEnabled, taxRatePercent, serviceEnabled, serviceRatePercent}) -> {subtotalPiastres, servicePiastres, taxPiastres, totalPiastres}`. Also in that file: `calculateSubtotalPiastres(items)`, `computeInitialTaxServiceSettings(detected)`, and the `TaxServiceSettings` type.
- **`roundHalfUp`** lives in `client/app/domain/money.ts`, not `splitCalculation.ts` — `Math.floor(piastres + 0.5)`. Verified during Story 1.3's review to be the mathematically correct "round half **up**" (toward +infinity) behavior, which is what AD-3 names; a reviewer incorrectly claimed it was "unsafe" for negative inputs using the wrong rounding convention as their reference point — money is never negative in this domain regardless, so it's moot either way.
- **Every existing screen calls `useSplitSession()`'s full-object-replace setters directly from UI handlers** (`setPhoto`, `setExtractionResult`, `setTaxService`) — a known, already-deferred tension with the Architecture Spine's Consistency Conventions wording ("mutated only through the split-domain layer, never directly from UI event handlers"). Not this story's concern to fix (no UI changes expected here at all).
- **No git history exists** (`baseline_commit: NO_VCS`) — still true; nothing to diff against for review purposes, same as Stories 1.2/1.3.
- **Stack versions:** Expo SDK 57.0.7, React Native 0.86.0, React 19.2.3, TypeScript ~6.0.3, Node v25.2.1 (this environment) with native `.ts` execution support.

### References

- [Source: prd.md#FR-6, #NFR2 — compounding formula and integer-money requirements]
- [Source: ARCHITECTURE-SPINE.md#AD-3 — integer money, round-half-up rounding rule]
- [Source: addendum.md — Tax/Service Compounding Worked Reference: both the Greek Club Cairo and French-menu-restaurant examples]
- [Source: epics.md Story 1.4 — acceptance criteria this story's ACs are derived from]
- [Source: 1-3-confirm-tax-and-service-applicability-and-rate.md — where `calculateSplitTotals` was actually built; its Dev Notes explicitly predicted this story's likely shape; its code review independently re-verified both worked examples and deferred the floating-point question here]
- [Source: deferred-work.md — "Deferred from: code review of 1-3..." entry for the floating-point multiplication concern this story's Task 2 formally resolves]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (via Claude Code)

### Debug Log References

- `cd client && npx tsc --noEmit` — clean before and after adding `client/scripts/verifySplitCalculation.ts`.
- `npx tsx client/scripts/verifySplitCalculation.ts` — all 18 checks pass, including the 120,300,000-combination floating-point sweep (0 mismatches, ~5s runtime).
- `node client/scripts/verifySplitCalculation.ts` (plain node) — confirmed to fail with `ERR_MODULE_NOT_FOUND` due to a module-resolution mismatch between Node's ESM loader and the project's `moduleResolution: "bundler"` tsconfig; not used for the final verification. See Task 1's completion note and the script's own header comment.
- `grep -rn "roundHalfUp\|Math.floor.*+.*0\.5\|Math\.round.*piastres" client/app` — confirmed exactly one rounding implementation (`money.ts#roundHalfUp`) is in play for this calculation.

### Completion Notes List

- This story added zero functional code changes to the split-calculation logic itself — as Story 1.3's own Dev Notes predicted, the formula already existed and was already correct. This story's actual contribution is `client/scripts/verifySplitCalculation.ts`: a durable, re-runnable verification (not a test suite — no framework installed, matching Architecture's v1 deferral) proving all three ACs, including an exhaustive empirical closure of a question Story 1.3's code review had explicitly deferred here (floating-point rounding risk in the rate multiplication).
- One story-authoring assumption corrected during implementation: the story claimed plain `node` could run the verification script directly. That's true in isolation but not for a script that imports from the app's own module tree, because Node's ESM loader and the project's TypeScript "bundler" resolution mode disagree on whether extensionless relative imports are legal. Resolved by using `npx tsx` instead (no new dependency, no tsconfig change) and documented in both the script and this record so it isn't rediscovered as a surprise later.
- No automated tests in the traditional sense — consistent with every prior story's Testing Requirements section and Architecture's explicit CI/testing-infrastructure deferral for v1. The verification script *is* this story's testing artifact, just not wired into any framework or CI.
- Not verified in a running app (nothing here touches UI — this story is a backend-logic verification pass only, no screens changed).

### File List

**Added:**
- `client/scripts/verifySplitCalculation.ts`

**Modified:**
- `_bmad-output/implementation-artifacts/deferred-work.md` — marked the Story 1.3 floating-point deferral resolved, pointing at this story's verification script as evidence. (Tracking-doc change, not app code — noted here for completeness per the story's own "only touch permitted sections" instruction not applying to this file.)
