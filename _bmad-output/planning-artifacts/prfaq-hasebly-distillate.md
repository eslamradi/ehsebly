---
title: "PRFAQ Distillate: hasebly"
type: llm-distillate
source: "prfaq-hasebly.md"
created: "2026-07-16"
purpose: "Token-efficient context for downstream PRD creation"
---

## Core Concept
- hasebly: mobile app for splitting Egyptian restaurant bills fairly, accounting for 14% VAT + 12% service charge.
- Primary customer: "the bill-fronter" — the person in a group dinner who ends up holding the check and doing the split math while the table waits. This is the single persona to design for; the "underpaying/overpaying" fairness concern is served through the fronter's tool, not as a separate persona.
- Concept type: commercial consumer mobile app, solo founder, MVP stage.

## Problem
- Groups today either (a) split evenly — fast but unfair (light eaters subsidize heavy eaters, creates quiet resentment) or (b) do manual itemized math — fair but slow, creates an awkward multi-minute pause at the table.
- Splitwise and similar incumbents are built for ongoing shared-living expense tracking (roommates, trips) with account setup, persistent groups, and later settlement — not a one-time, under-60-second, at-the-table split.

## v1 Solution Loop (validated scope — see "MVP Scope" below for actual first build)
1. Fronter photographs the receipt.
2. OCR extracts line items and prices.
3. Fronter confirms via two taps whether 14% tax and/or 12% service actually apply (NOT auto-detected — receipts vary: some charge both, some bake one/both into prices with no separate line, some charge neither; auto-detection deemed untrustworthy given OCR-accuracy risk).
4. Fronter taps to assign each item to the person(s) who had it (supports many-to-one for shared items, e.g. a shared appetizer split three ways).
5. App shows each person's exact total including proportional tax/service — fronter reviews and can correct any misread item/price before finalizing (critical trust-preserving step, added after Customer FAQ exposed the gap).
6. Output: "who owes whom how much." No in-app payment — settlement happens manually via InstaPay, Vodafone Cash, or cash (deliberate v1 scope decision, narrows compliance/regulatory surface).
7. Split history saved under a private, anonymous auto-created ID (random username, no visible sign-up flow) — survives reinstall; user can optionally link email/phone later for cross-device sync. Ads matched to anonymous ID, not to name/phone/email unless linked.

## MVP Scope (the actual first build — smaller than the full press-release vision)
- One platform only (not both iOS and Android at launch).
- Manual tap-assign only, no smart suggestions.
- NO local history, NO anonymous ID/account layer, NO ads in the first build — these are the full-product destination (Stage 2/3 decisions), not part of the initial test.
- Core loop only: scan → confirm tax/service applicability → tap-assign → review/fix → see split.
- Rationale: prove the OCR + math loop works live at a table before building the account/monetization layer on top of an unvalidated core.

## Business Model
- Free to download and use, no subscription, no per-split fee. Monetized via ads, shown only after split completion (not interleaved into the scan/confirm/assign flow) to protect the speed value prop.
- Named risk: cloud OCR API cost-per-scan could exceed ad revenue at low volume — early unit economics likely net-negative. Accepted trade-off for MVP; revenue is not the v1 success metric.

## Validation Plan (concrete, committed)
- **Top technical risk:** OCR reliability on real Egyptian receipts (thermal paper, mixed Arabic/English, handwritten additions) is unproven — no competitor accuracy claims are from Arabic-market testing.
- **De-risking spike:** test an existing OCR service (Google Cloud Vision, Azure Document Intelligence, or vision-capable LLM API) against 15-20 real, varied receipts collected during the friends-dinner test. Failure signal: more than ~1-in-3 receipts needing heavy correction even with the review step as backstop.
- **Go/no-go threshold:** 10 real dinners with the founder's own friends. Success = founder still reaches for hasebly over a calculator by dinner 10, and friends aren't waving it off for being slow/wrong. Either failure condition at dinner 10 = stop and rework before proceeding.
- **Growth-loop dependency:** the "first 100 users via word-of-mouth at the table" plan shares its biggest risk with the OCR question — a bad scan in front of friends breaks both the trust threshold and the growth loop simultaneously. This is the concept's single point of failure right now.

## Competitive Landscape (research-grounded, gathered mid-PRFAQ)
- Splitwise Pro already has receipt OCR (in-app camera only, no gallery import, paid tier) — invalidated the original "we have OCR, they don't" differentiation; forced reframe.
- Niche indie apps (Splitty, SplitSnap, Scan & Split Bill) already do OCR + proportional tax/tip splitting in other (non-MENA) markets, claiming 99%+ accuracy — OCR pattern itself is commoditized, not a moat.
- No MENA-specific competitor combines receipt OCR + Egypt-specific 14%/12% tax structure + no-account settlement hand-off — confirmed regional white space.
- Egypt digital settlement layer is mature: InstaPay ~16M users (targeting 20M by end of 2026), Vodafone Cash ~55% of wallets/~81% of P2P transaction value, mobile wallet transaction value up 72% YoY (Q2 2025, $19.63bn). Validates the decision not to build in-app payments.
- Egypt mobile payments market projected ~16.5-16.8% CAGR, ~$85-99bn (2025/26) to ~$184-212bn by 2030/31 — strong tailwind for adjacent consumer fintech-utility apps.
- Long-standing unmet user demand signal: Splitwise's own feedback boards show years-old requests for OCR (before Pro added it) and an unresolved (since 2019) complaint about camera-only capture, no gallery import.

## Competitive Moat — Named Risk, Accepted Trade-off
- Thin: OCR + local tax math is a copyable pattern. A global player (e.g., Splitwise Pro) could add an "Egypt tax preset" quickly and blunt localization edge.
- What's actually defensible: speed-to-real-users (first-mover trust in the Egyptian dining audience via word-of-mouth, slow to copy even when the feature isn't) and depth of local execution (Arabic/thermal receipt handling correctness a global player has less incentive to prioritize for one market).
- Not resolved — flagged as needing a real second answer before any launch wider than friends-of-friends.

## Rejected/Superseded Framings
- Original differentiator "we scan receipts, Splitwise doesn't" — rejected after research showed Splitwise Pro already has OCR.
- "No Account" headline/positioning — retired in favor of "No Sign-Up" after the anonymous-ID architecture decision revealed an account does exist behind the scenes, just with zero visible signup friction. This distinction matters for privacy-conscious customer questions.
- Pure "fully local, nothing synced" history model (Stage 1/2 initial decision) — superseded by the anonymous-ID model (Stage 3) to solve cross-device history and enable non-PII-based ad targeting, without reintroducing a visible signup flow.
- Rejected headline drafts: "Hasebly Turns a Restaurant Receipt Photo Into an Instant, Fair Bill Split" (generic, unearned "instant" claim); "No More Calculator at the Table..." (right instinct, too long).
- Considered and explicitly deferred: cross-device/persistent-group history (would recreate the Splitwise ledger model this product is positioned against) — not in scope even for full product vision, only per-device/per-anonymous-ID history.
- Considered and explicitly deferred: live/shared multiplayer item-assignment (each person assigns their own items in real time) — v1 and full vision both keep 100% of assignment labor on the fronter; flagged as an open tension, not resolved, revisit if larger tables prove the single-tapper model too slow.

## Legal/Regulatory
- Low exposure at MVP stage: no in-app payments, no required PII, no account layer in first build.
- Egypt data protection law (151/2020) becomes relevant once optional account-linking (email/phone) ships — needs a basic privacy notice at that point, not before.
- CBE is formalizing payment-operator licensing (mid-2025 rules, transition through June 2026) — not a v1 concern since hasebly doesn't move money; watch-item only if payment integration is ever added to the roadmap.

## Open Questions / Unknowns Carried Forward
- OCR accuracy on real Egyptian receipts — unproven, spike planned but not yet executed.
- Ad revenue viability at scale — unproven, cost-per-scan vs. revenue-per-user not yet modeled with real numbers.
- Growth beyond the initial friend graph — no validated channel yet beyond word-of-mouth.
- Whether single-tapper item assignment holds up for larger tables (6+) — deferred tension, not resolved.
- "Under a minute" end-to-end timing claim in the press release — aspirational, unverified, pending real timing data from the 10-dinner test.

## Verdict
- Overall: solid, MVP-ready concept with one clearly identified, unproven load-bearing risk (OCR reliability) — not yet "forged in steel," but forged pending an already-scoped test.
- Recommended before/alongside PRD work: run the OCR spike (15-20 receipts) early, since the PRD's technical approach and scope should reflect real OCR feasibility data rather than the current unproven assumption.
- PRD should encode the stripped-down MVP scope (one platform, manual tap-assign, no accounts/history/ads) as the actual v1 — not the full press-release vision, which is the intended destination after the 10-dinner validation passes.
