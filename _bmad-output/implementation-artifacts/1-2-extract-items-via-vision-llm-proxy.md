---
baseline_commit: NO_VCS
---

# Story 1.2: Extract Items via Vision-LLM Proxy

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a fronter,
I want hasebly to read the items, prices, and any tax/service lines off my photographed receipt,
so that I don't have to type anything in by hand.

## Acceptance Criteria

1. Given I've captured and confirmed a receipt photo (Story 1.1), When the photo is sent to the backend, Then the backend (Cloudflare Worker) calls the vision-LLM API and returns exactly one of two shapes — `{status: "ok", items: [...], tax_line?, service_line?}` or a failure shape (`{status: "no_items_found"}` / `{status: "error", message}`) — never a raw vendor payload. [Source: prd.md#FR-2; ARCHITECTURE-SPINE.md#AD-4]
2. Given the same request, When the Worker constructs it, Then the vision-LLM API key is read only from the Worker's environment secret, never embedded in the client build or committed to the repo. [Source: prd.md#NFR3; ARCHITECTURE-SPINE.md#AD-5]
3. Given the photo yields plausible line items, When extraction succeeds, Then the extracted items are presented to the fronter as an editable list, not auto-committed to session state, and if an explicit tax or service line was legible on the receipt, its rate is captured on the session for Story 1.3 to pre-fill, rather than defaulting blind. [Source: prd.md#FR-2; epics.md Story 1.2]
4. Given the photo is blurry, not a receipt, or otherwise yields zero plausible line items, When extraction is attempted, Then the fronter sees an explicit "couldn't read this receipt" state with the option to retry or enter items manually — not a blank or broken screen. [Source: prd.md#FR-3; epics.md Story 1.2]
5. Given the Worker cannot reach the vision-LLM API or the call times out, When this happens, Then the client treats it identically to the AD-4 `{status: "error"}` shape (same fallback UI as AC #4) rather than hanging or crashing — this closes a gap the Implementation Readiness Report flagged as implicit rather than explicit. [Source: Implementation Readiness Report 2026-07-16, item 3]

## Tasks / Subtasks

- [x] Task 1: Scaffold the Cloudflare Worker as its own project under `client/backend/worker/` (AC: #1, #2)
  - [x] Initialize with `npm create cloudflare@latest` (or equivalent) targeting a "Hello World" Worker, TypeScript template — **the Worker's own `package.json`/`wrangler.jsonc`/`tsconfig.json` live at `client/backend/worker/`, nested inside the `client/` directory, NOT at the repo root as `hasebly/backend/`.** This is a deliberate, already-made decision (Architecture's Structural Seed tree + the architecture `.memlog.md`'s "Scaffold location" entry, both dated 2026-07-19) to keep all app code — mobile and backend — under one subtree separate from `_bmad-output`. It reads unusual (a "backend" folder inside "client") but is intentional; do not relocate it to the repo root.
    - Hand-scaffolded (package.json, wrangler.jsonc, tsconfig.json, .gitignore) rather than running the interactive `npm create cloudflare@latest` CLI, to keep the scaffold deterministic and non-interactive. `@cloudflare/workers-types` pinned to `^5.20260714.1` — wrangler 4.112.0's peer dependency requires v5; v4 (as originally drafted) fails `npm install` with an ERESOLVE conflict.
  - [x] Do not add the Worker's `node_modules`/build output as a dependency of the Expo client's `package.json` — they are two independent Node projects that happen to share a parent directory.
    - Also had to add `"exclude": ["node_modules", "backend"]` to the **client's own** `tsconfig.json` — without it, the client's root `tsc` run walked into `backend/worker/src` and failed on `ExportedHandler` (a Workers-only global type the client's TS environment doesn't have). Not anticipated in the story text; noted here since it's a real gotcha for anyone re-scaffolding this layout.
  - [x] Set the vision-LLM API key via `wrangler secret put ANTHROPIC_API_KEY` (or whichever env var name you choose) — never in `wrangler.jsonc`/`wrangler.toml`, never in a `.env` file that gets committed. This is the only place the key may live (AC #2, AD-5).
    - Documented via `.dev.vars.example` (committed, placeholder only) + `.gitignore` covering `.dev.vars`. Running `wrangler secret put` against a real Cloudflare account is a deployment-time action for the founder, not something this session can do — the Worker code reads `env.ANTHROPIC_API_KEY` and never falls back to a hardcoded value.
- [x] Task 2: Implement the extraction endpoint and enforce the AD-4 contract (AC: #1, #2, #4, #5)
  - [x] Single `POST` route accepting the receipt image as the raw request body (binary, `content-type: image/jpeg`) — expo-camera's `takePictureAsync` default output is JPEG, so no format negotiation is needed.
  - [x] Call the Anthropic Messages API via `fetch()` directly (raw HTTP, `https://api.anthropic.com/v1/messages`) — do **not** add `@anthropic-ai/sdk` as a dependency for this Worker. A single-endpoint proxy calling one API doesn't need an SDK, and it keeps the Worker's dependency footprint at zero, which matters more for a Cloudflare Worker (cold-start size, edge runtime compatibility) than for a normal Node backend.
  - [x] Base64-encode the image bytes and send as a vision content block: `{"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "<base64>"}}`, alongside a text instruction block, in a single user message.
  - [x] **Force structured, schema-valid output via a single required tool call** — define one tool (e.g. `extract_receipt`) whose `input_schema` mirrors the AD-4 `ok` shape (`items: [{name: string, price_piastres: integer}]`, optional `tax_line: {rate_percent: number}`, optional `service_line: {rate_percent: number}`), set `"strict": true` on the tool definition, and force it with `tool_choice: {"type": "tool", "name": "extract_receipt"}`. This guarantees the model's response is schema-valid JSON — don't parse free-form text output and hope it's valid JSON.
  - [x] Model: `claude-opus-4-8`. No thinking/effort configuration needed — this is a single-shot structured extraction call, not a reasoning task; the API defaults are fine.
  - [x] **Convert every price to an integer minor-currency-unit (piastres = EGP × 100) inside the Worker, before the response ever leaves it.** Round-half-up applied via `roundHalfUp()` in `extract.ts`.
  - [x] On zero items extracted, return `{"status": "no_items_found"}` — HTTP 200.
  - [x] On any Worker-side failure — timeout (20s `AbortController`), non-2xx, unparseable JSON, or a malformed tool-call shape — return `{"status": "error", "message": "<short, non-sensitive description>"}`. `extractToolInput()` validates the response shape defensively before trusting it; anything unexpected falls through to the generic error, never a raw passthrough.
  - [x] The client never receives anything from this Worker except one of the three AD-4 shapes.
- [x] Task 3: Build the client-side API layer implementing the AD-4 contract (AC: #1)
  - [x] `client/app/api/extractReceipt.ts` — reads the local photo URI via `fetch(uri).blob()` (the standard Expo/React Native idiom for a local `file://` URI), POSTs the raw blob to the Worker, and returns the typed `ExtractionResult` union. Never throws — every failure path returns `{status: "error"}`.
  - [x] `ExtractionResult` type defined in `client/app/api/types.ts`.
  - [x] Worker URL resolved via `client/app/api/extractionEndpoint.ts`, reading `EXPO_PUBLIC_EXTRACTION_ENDPOINT` with a `http://localhost:8787` fallback (the default `wrangler dev` port) — a pragmatic default for local development, overridable per environment without a code change.
- [x] Task 4: Extend session state to hold the extraction outcome (AC: #3, #4, #5)
  - [x] `SplitSession` gains `extractionResult: ExtractionResult | null` and a `setExtractionResult` action, mutated only through that action.
  - [x] The extraction HTTP call itself is NOT in `session.tsx` — `CaptureScreen` calls `app/api`'s `extractReceipt`, then calls `setExtractionResult` with the result.
  - [x] `app/domain/money.ts` added as the seed for the pure-function separation Story 1.4+ will need (`formatPiastresAsEGP` / `parseEGPToPiastres`) — kept out of `session.tsx` per the note about the domain/pure-functions-vs-Context tension.
    - Also found and fixed a stale-state bug of the same shape 1.1's review caught for `photoUri`: `clearPhoto()` now also nulls `extractionResult`, so a retake-after-extraction can't leave session state pointing at items read off a photo the fronter just rejected.
- [x] Task 5: Trigger extraction on photo confirm; build the extracted-items and failure screens (AC: #3, #4, #5)
  - [x] `CaptureScreen.handleConfirm` now awaits `extractReceipt` immediately after confirming, stores the result via `setExtractionResult`, and navigates to `ExtractedItems` or `ExtractionFailed` based on `result.status`. A loading state (`ActivityIndicator` + "Reading your receipt…") renders inline in the existing confirmed-photo view while extraction is in flight — no separate loading screen needed.
  - [x] `ExtractedItemsScreen` renders each item's name/price in editable `TextInput`s (per-keystroke updates via `setExtractionResult`, not a separate "save" step) plus a note when a tax/service line was detected. Defensively renders a fallback message if reached without an `'ok'` result rather than crashing on `result.items`.
  - [x] `ExtractionFailedScreen` handles both `no_items_found` and `error` behind one "Couldn't read this receipt" UI with two controls: **Retry** and **Enter Items Manually**. Interpreted "retry" as re-scanning a fresh photo (clears session + navigates to `Capture`) rather than re-sending the same failed bytes, per the PRD's UJ-1 edge-case wording ("re-scans or gives up") — the task text offered both readings ("re-run extraction on the same photo, or go back to retake"); re-scan matches product intent since a genuinely blurry/non-receipt photo will fail identically on a same-bytes retry. `ManualEntryScreen` is a minimal stub (no FR specifies manual-entry UI yet) with a working "Back to Camera" control — a real, reachable screen, not a dead button.
  - [x] `accessibilityLabel` added on every new interactive control from the start. Guarded `handleConfirm` against double-fire via the existing `extracting` flag; guarded the extraction-failed retry path implicitly by making it a one-shot navigation rather than a re-triggerable async call.
    - New, not explicitly anticipated by the task list: because `CaptureScreen` stays mounted underneath the new screens (native-stack doesn't unmount lower screens), returning to `Capture` via `ExtractionFailedScreen`'s Retry or `ManualEntryScreen`'s Back-to-Camera would otherwise show the stale "Photo captured" view instead of the live camera. Added a `useFocusEffect` in `CaptureScreen` that resets local `pendingUri`/`confirmedUri` whenever the screen regains focus with `session.photoUri` cleared.

### Review Findings

Three parallel adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor vs. this story + Architecture Spine) ran against the full current content of every file in this story's File List (no git history exists yet, so no true incremental diff was available). 43 raw findings collapsed to 31 after merging duplicates across layers: 1 decision-needed, 14 patches, 5 deferred, 11 dismissed as noise/false-positive/handled-elsewhere.

- [x] [Review][Decision] The vision-LLM performs the decimal→integer-piastres arithmetic conversion itself (per the `price_piastres` field's schema description in `client/backend/worker/src/extract.ts:28-32`), rather than the Worker extracting a raw printed price string and converting it deterministically. This is exactly what this story's own Task 2 directed, not a developer deviation — but it's a real design tradeoff on the app's core correctness promise (SM-2: zero split-vs-printed-total mismatches after review). **Resolved: revise the contract.** The tool schema's `price_piastres: integer` field was replaced with `price_egp_text: string` (transcription only, no model arithmetic); the Worker deterministically parses that string into integer piastres via a new pure function, `client/backend/worker/src/money.ts#parsePrintedPriceToPiastres`, using integer string arithmetic (no floats). An unparseable price now explicitly rejects the whole extraction as `{status: "error"}` rather than silently guessing. This also fully resolves two `patch` findings below as a direct consequence: the now-dead `roundHalfUp()` function was removed entirely (nothing to round — string parsing is exact), and per-item price validation now exists where none did before (a malformed transcription is rejected, not passed through).

- [x] [Review][Patch] Client fetch to the Worker has no timeout — a hung/unreachable Worker leaves the fronter stuck on "Reading your receipt…" indefinitely, with Retake disabled and no other escape. **Fixed**: added an `AbortController` with a 30s timeout (generous margin over the Worker's own 20s vision-LLM budget) around both fetch calls, mirroring the pattern already used server-side. [client/app/api/extractReceipt.ts]
- [x] [Review][Patch] `extract.ts` never checks the Anthropic response's `stop_reason` — a receipt large enough to exceed `max_tokens` (2048) would silently return a partial item list labeled as a successful `{status:'ok'}` extraction. **Fixed**: added `isTruncatedResponse()`, checked right after the response body is parsed; a `stop_reason: "max_tokens"` now maps to `{status: "error"}` instead of a silently-partial success. [client/backend/worker/src/extract.ts]
- [x] [Review][Patch] `parseEGPToPiastres` accepted negative numbers unguarded, silently truncated malformed input (e.g. `"12.34.56"` → 12.34), and used float multiplication (`parsed * 100`). **Fixed**: rewrote to return `number | null` (null on anything that isn't a plain non-negative decimal with ≤2 fractional digits) using the same integer-string-arithmetic approach as the Worker's `parsePrintedPriceToPiastres` — no float multiplication anywhere. [client/app/domain/money.ts]
- [x] [Review][Patch] Editing a price field down to empty immediately reformatted to "0.00" on every keystroke — made it impossible to backspace-and-retype a price naturally. **Fixed**: price editing now uses a local per-row draft (`priceDrafts` state) that only commits to session state — and only reformats the field — on blur, not on every keystroke. Invalid input on blur is discarded (reverts to the last valid price) rather than committed. [client/app/screens/ExtractedItemsScreen.tsx]
- [x] [Review][Patch] "Use Photo" button wasn't disabled during confirm/extraction, and the state-based `extracting` guard alone had a closure-staleness race window on rapid double-tap. **Fixed**: added `confirmingRef` (a `useRef`, mutated synchronously) as the actual re-entry guard in `handleConfirm`, closing the race regardless of React's state-update/render timing. [client/app/screens/CaptureScreen.tsx]
- [x] [Review][Patch] `ExtractedItemsScreen`'s happy path had no way back — the only exit was an undocumented OS-level back gesture, unlike its two sibling screens. **Fixed**: added a "Back to Camera" control (clears session + navigates to `Capture`), consistent with the pattern `ExtractionFailedScreen`/`ManualEntryScreen` already used. [client/app/screens/ExtractedItemsScreen.tsx]
- [x] [Review][Patch] `extractToolInput()` validated only that `items` is an array — item `name` typing and `tax_line`/`service_line` shape were never checked. Price validation was already covered by the DN1 fix; this closes the remaining scope. **Fixed**: added `isValidToolInput()`/`isValidRateLine()`, validating every item's `name`/`price_egp_text` are strings and that `tax_line`/`service_line` are either `null` or `{rate_percent: number}`, before the input is trusted. [client/backend/worker/src/extract.ts]
- [x] [Review][Patch] `roundHalfUp()` was applied to a value the schema already guaranteed was an integer under `strict: true` — a no-op given current inputs (dead code). **Resolved as a direct consequence of the DN1 fix**: the function is deleted outright — there's nothing left to round since price parsing is now exact integer string arithmetic (`money.ts`), not model-produced values needing a safety-net round. This also fully resolves the "two independent rounding implementations" duplication, since only `money.ts`'s client-side parser remains. [client/backend/worker/src/extract.ts]
- [x] [Review][Patch] `tool_use` block was matched by `type` only, never checking `block.name === 'extract_receipt'`. **Fixed**: the match predicate in `extractToolInput()` now also requires `block.name === 'extract_receipt'`. [client/backend/worker/src/extract.ts]
- [x] [Review][Patch] No `env.ANTHROPIC_API_KEY` presence check — a missing secret produced a generic "Extraction service returned 401" rather than a clear "not configured" error. **Fixed**: added an explicit presence check at the top of the fetch handler, returning `{status: "error", message: "Extraction service is not configured."}` (HTTP 500) before any call is attempted. [client/backend/worker/src/index.ts]
- [x] [Review][Patch] No `console.error` logging on Worker error branches despite `observability: {enabled: true}` already being on. **Fixed**: added `console.error` calls at every error-returning branch in both `extract.ts` and `index.ts`. [client/backend/worker/src/extract.ts, client/backend/worker/src/index.ts]
- [x] [Review][Patch] `request.arrayBuffer()` wasn't wrapped in try/catch. **Fixed**: wrapped in try/catch, returning a proper AD-4 `{status: "error"}` JSON shape (HTTP 400) from the Worker itself on failure, rather than relying on the client's outer catch-all. [client/backend/worker/src/index.ts]
- [x] [Review][Patch] `ExtractedItemsScreen`'s non-`'ok'` fallback branch had no recovery control, unlike its two sibling screens. **Fixed**: added the same "Back to Camera" control to this branch. [client/app/screens/ExtractedItemsScreen.tsx]
- [x] [Review][Patch] `ExtractionFailedScreen` had no explicit branch for an (unreachable) `'ok'` session state — fell through to the generic "no items found" message. **Fixed**: extracted a `describeFailure()` helper with an explicit (if defensive/currently-unreachable) branch for `'ok'`. [client/app/screens/ExtractionFailedScreen.tsx]

- [x] [Review][Defer] No authentication, no request size cap, no rate limiting on the Worker endpoint — deferred, pre-existing: Architecture's own Deferred section already covers this exact scenario ("Rate-limiting / abuse protection on the proxy — not needed for a handful of friends... revisit if the build is ever shared wider than that"). [client/backend/worker/src/index.ts]
- [x] [Review][Defer] Hand-duplicated request/response types across the Worker/client network boundary with no shared package or contract test — deferred, pre-existing: fixing it means introducing monorepo/shared-package tooling this v1 explicitly doesn't have. Revisit if the contract grows more fields. [client/backend/worker/src/types.ts, client/app/api/types.ts]
- [x] [Review][Defer] Array index used as React `key` in `ExtractedItemsScreen`'s item list — deferred, pre-existing pattern from this story's own scope (safe today since the list is never reordered/added/removed here); Story 1.6 will need to touch this exact list and should revisit the key strategy then. [client/app/screens/ExtractedItemsScreen.tsx:45]
- [x] [Review][Defer] `no_items_found` responses discard any detected `tax_line`/`service_line` even when the model legibly read the tax/service footer but found no items — deferred, pre-existing: this is mandated by AD-4's fixed contract shape (`{"status": "no_items_found"}` carries no fields), so fixing it means changing the architecture-level contract, not a story-level patch. [client/backend/worker/src/extract.ts:151-153]
- [x] [Review][Defer] `ARCHITECTURE-SPINE.md`'s dependency-direction diagram (`UI → Domain → APIClient`) doesn't match the actual call graph (`UI → APIClient` directly) — deferred, pre-existing: this exact call pattern was explicitly directed by this story's own Task 4 text, not a developer improvisation. Worth a diagram update next time the architecture doc is touched. [ARCHITECTURE-SPINE.md — Dependency direction diagram]

## Dev Notes

- **Paradigm reminder (AD-1, AD-2):** the Worker is a stateless translation edge only — image in, AD-4 JSON out, nothing retained, no split-math. All split-domain logic (tax/service confirmation math, assignment, reconciliation) stays entirely client-side and is out of this story's scope (Stories 1.3–1.7).
- **Testing:** No automated test coverage is expected for this story, consistent with Story 1.1's own Testing Requirements section and Architecture's explicit deferral of CI/testing infrastructure for v1 (`ARCHITECTURE-SPINE.md#Deferred`). Manual verification against a handful of real receipt photos (the founder's own camera roll, same as the OCR spike) is the expected validation method — including at least one blurry/non-receipt photo to exercise AC #4.
- **Naming:** Code-level domain terms must match the PRD Glossary exactly — `Item`, not `LineItem` or `ReceiptItem`; no synonyms (Consistency Conventions).

### Project Structure Notes

- New directories this story creates: `client/app/api/` and `client/backend/worker/`. Both are named in the Architecture Structural Seed tree; neither existed before this story.
- **Non-obvious placement, called out explicitly because it's easy to get wrong:** `backend/worker/` nests under `client/`, i.e. the full path is `hasebly/client/backend/worker/`, not `hasebly/backend/worker/`. See Task 1 for the full rationale — this was a deliberate call made during Story 1.1's scaffolding, not an accident in the architecture doc's ASCII tree indentation.
- No conflicts detected between this story's file additions and Story 1.1's existing tree (`client/app/screens/CaptureScreen.tsx`, `client/app/domain/session.tsx`, `client/App.tsx`) — this story extends those files, it doesn't restructure them.

### References

- [Source: prd.md#FR-2, #FR-3, #NFR3 — extraction, unreadable-receipt handling, key-secrecy requirements]
- [Source: ARCHITECTURE-SPINE.md#AD-1, #AD-3, #AD-4, #AD-5 — stateless-proxy paradigm, integer-money rule, extraction contract, no-client-secrets rule]
- [Source: ARCHITECTURE-SPINE.md — Stack table (Cloudflare Workers), Structural Seed tree (`app/api/`, `backend/worker/` under `client/`)]
- [Source: epics.md Story 1.2 — acceptance criteria this story's ACs are derived from]
- [Source: implementation-readiness-report-2026-07-16.md item 3 — network/timeout gap this story's AC #5 closes]
- [Source: prfaq-hasebly.md — OCR spike methodology, "read directly by a vision-capable LLM (Claude)" — grounds the model choice in Dev Notes/Task 2]
- [Source: 1-1-capture-receipt-photo.md — previous story's established patterns: domain-layer-only mutation, `accessibilityLabel` on all interactive elements from the start, guard against double-fire]

## Previous Story Intelligence (from Story 1.1)

- **Session state pattern to continue:** `SplitSessionProvider` in `app/domain/session.tsx` exposes named actions (`setPhoto`, `clearPhoto`); screens never call `setSession` directly. Extend this file with the same shape rather than introducing a second state container.
- **File locations already established:** `client/app/screens/CaptureScreen.tsx`, `client/app/domain/session.tsx`, `client/App.tsx` (single-route `Stack.Navigator`, currently only `Capture`). This story adds new screens to that same navigator and is the first to populate `app/api/`.
- **Patterns Story 1.1's code review converged on** (apply proactively rather than fixing in review again): every interactive `Pressable`/control gets an `accessibilityLabel`; guard any action that can double-fire (rapid taps, concurrent async calls) with a busy-state flag; wrap external calls (camera, permissions, and here — the Worker fetch) in try/catch with a user-visible fallback state, never a silent failure.
- **Deferred items relevant to this story:** none of Story 1.1's deferred items block 1.2. The domain/pure-functions-vs-Context tension (see Task 4) is flagged for 1.4+, not this story.
- **Stack versions actually installed** (superseding the architecture doc's original research-time figures): Expo SDK 57.0.7, React Native 0.86.0, React 19.2.3, TypeScript ~6.0.3. No new client dependencies are needed for this story beyond what a Cloudflare Worker scaffold brings into its own separate `package.json`.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (via Claude Code)

### Debug Log References

- `cd client/backend/worker && npm run typecheck` — clean (`tsc --noEmit`, no output).
- `cd client && npx tsc --noEmit` — clean after excluding `backend/` from the client's own tsconfig (see Task 1 notes).
- No automated test suite exists for this project yet (Architecture's explicit CI/testing-infrastructure deferral for v1); no test run to report. Manual verification against real receipt photos requires a deployed/running Worker with a real `ANTHROPIC_API_KEY` and a physical device or simulator, which is outside what this session can execute — flagged for the founder to do before treating this story as fully verified end-to-end.

### Completion Notes List

- Implemented all 5 tasks. Both TypeScript projects (`client/` and `client/backend/worker/`) typecheck cleanly with strict mode on.
- No automated tests written or run, per this story's own Dev Notes ("No automated test coverage is expected for this story") and Story 1.1's precedent — consistent with Architecture's explicit deferral of CI/testing infrastructure for v1.
- Two judgment calls made where the task text offered a choice or didn't fully specify: (1) "retry" on the failure screen re-scans a fresh photo rather than re-sending the same failed bytes, per the PRD's UJ-1 wording — see Task 5 notes; (2) the Worker was hand-scaffolded rather than run through the interactive `npm create cloudflare@latest` wizard, for a deterministic, reviewable result.
- One dependency-version fix beyond the story's literal text: `@cloudflare/workers-types` needed to be `^5`, not `^4`, to satisfy wrangler 4.112.0's peer dependency (an ERESOLVE conflict on `npm install` otherwise). Not a design decision, just current-package-version reality at implementation time.
- One defensive fix applied proactively rather than discovered in review: `clearPhoto()` now also clears `extractionResult`, preventing a retake-after-extraction from leaving session state pointing at items read off a rejected photo — the same class of bug Story 1.1's review caught for the photo itself.
- Not yet verified against real receipt photos end-to-end (requires a deployed Worker with a live `ANTHROPIC_API_KEY`, which this session doesn't have) — see Debug Log References. Structural/contract-level implementation is complete and typechecked; the vision-LLM's actual extraction accuracy against real Egyptian receipts (mixed Arabic/English, thermal fade) is unverified by this session.

### File List

**Added:**
- `client/backend/worker/package.json`
- `client/backend/worker/wrangler.jsonc`
- `client/backend/worker/tsconfig.json`
- `client/backend/worker/.gitignore`
- `client/backend/worker/.dev.vars.example`
- `client/backend/worker/src/types.ts`
- `client/backend/worker/src/extract.ts`
- `client/backend/worker/src/index.ts`
- `client/app/api/types.ts`
- `client/app/api/extractionEndpoint.ts`
- `client/app/api/extractReceipt.ts`
- `client/app/navigation/types.ts`
- `client/app/domain/money.ts` — later rewritten during code review (see Modified).
- `client/app/screens/ExtractedItemsScreen.tsx`
- `client/app/screens/ExtractionFailedScreen.tsx`
- `client/app/screens/ManualEntryScreen.tsx`
- `client/backend/worker/src/money.ts` — added during code review, resolving the DN1 decision (deterministic price parsing instead of model arithmetic).

**Modified:**
- `client/app/domain/session.tsx` — added `extractionResult` to `SplitSession`, `setExtractionResult` action, `clearPhoto` now also clears `extractionResult`.
- `client/app/screens/CaptureScreen.tsx` — `handleConfirm` triggers extraction and navigates on result; added loading state; added `useFocusEffect` to reset local state on refocus with no session photo. Code review: added `confirmingRef` synchronous re-entry guard.
- `client/App.tsx` — registered `ExtractedItems`, `ExtractionFailed`, `ManualEntry` screens; `RootStackParamList` moved to `client/app/navigation/types.ts` (re-exported for backward compatibility).
- `client/tsconfig.json` — excludes `backend/` (separate TS project with its own Workers-specific types).
- `client/backend/worker/src/extract.ts` — code review fix (DN1): tool schema's `price_piastres: integer` field replaced with `price_egp_text: string` (transcription only); items now parsed via `parsePrintedPriceToPiastres()` with explicit rejection of unparseable prices; dead `roundHalfUp()` removed. Further code review fixes: `stop_reason: "max_tokens"` truncation check, `tool_use` block matched by `name` as well as `type`, full item/tax_line/service_line shape validation (`isValidToolInput`/`isValidRateLine`), `console.error` logging on every error branch.
- `client/backend/worker/src/index.ts` — code review fixes: `env.ANTHROPIC_API_KEY` presence check before use, `request.arrayBuffer()` wrapped in try/catch with a proper AD-4 error shape, `console.error` logging.
- `client/app/api/extractReceipt.ts` — code review fix: `AbortController` + 30s timeout on the client→Worker fetch.
- `client/app/domain/money.ts` — code review fix: `parseEGPToPiastres` rewritten to return `number | null` (rejects negative/malformed input), integer string arithmetic instead of float multiplication.
- `client/app/screens/ExtractedItemsScreen.tsx` — code review fixes: price editing now uses a per-row draft, committed only on blur (fixes reformat-while-typing); added a "Back to Camera" control on both the happy path and the defensive fallback branch.
- `client/app/screens/ExtractionFailedScreen.tsx` — code review fix: extracted `describeFailure()` with an explicit branch for the (unreachable) `'ok'` session state.

**Not committed (deliberately, per AD-5):** any real API key or `.dev.vars` file — none created; only the `.dev.vars.example` placeholder exists.
