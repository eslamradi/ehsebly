---
title: hasebly
created: 2026-07-16
updated: 2026-07-29
status: final
---

# PRD: hasebly
*Working title — confirm.*

## 0. Document Purpose

This PRD scopes the v1 test build of hasebly for a solo founder validating the concept with his own friend group before any wider build. It builds directly on `prfaq-hasebly.md` and `prfaq-hasebly-distillate.md` (Working Backwards PRFAQ, completed 2026-07-16) and the OCR de-risking spike run against 22 real receipts — this PRD does not re-derive that thinking — it converts it into buildable requirements. Features are grouped with functional requirements (FRs) nested underneath, numbered globally (FR-1 through FR-N) for stable downstream reference. Inline `[ASSUMPTION]` tags mark anything inferred rather than explicitly confirmed; all are indexed in §9.

## 1. Vision

hasebly is a mobile app that ends the moment at an Egyptian group dinner when the bill lands and someone has to work out — fast — who owes what. The person who always ends up doing that math (the "fronter") photographs the receipt; hasebly reads the items and prices, lets the fronter confirm the real tax and service charges on this specific bill, and computes each person's exact fair share — food, drinks, and their proportional slice of tax and service — in a few taps. No sign-up, no calculator, no awkward multi-minute pause at the table.

This PRD covers the **v1 test build**: a deliberately stripped-down version built to answer one question — does the core loop (scan → confirm rate → assign → review → split) actually work, live, at a real table, across 10 real dinners with the founder's own friends? Everything in the full press-release vision that isn't required to answer that question (accounts, cross-device history, ads) is explicitly out of scope here — see §6.

The OCR spike (22 real receipts) already answered the biggest feared risk — receipt legibility — and surfaced a more important one: tax and service rates and math vary by venue in ways the app must handle correctly, or it will confidently produce a wrong number. That correction is now core to this PRD, not a stretch goal.

## 2. Target User

### 2.1 Jobs To Be Done
- As the fronter, I need to know exactly what each person at the table owes — including their fair share of tax and service — without doing the math myself, so the table isn't waiting on me.
- As the fronter, I need to trust the number hasebly gives me enough to actually hand my phone to the waiter and pay, without re-checking it against the printed receipt myself.
- As the fronter (this is also me, the founder, for v1) I need a fast enough loop that I'll actually reach for hasebly instead of a calculator, dinner after dinner — that's the entire success bar for v1.

### 2.2 Non-Users (v1)
- People who are *not* the one fronting the bill — the core receipt-to-split flow (capture, extract, assign, review) has no self-serve flow for a non-fronter; they're told the number by the fronter. `[Updated 2026-07-29: this is now scoped to the core split flow specifically — Epic 2's group/settle-up surface does let invited members log in on their own device to view their balances. See §5.]`
- Anyone expecting in-app payment — v1 only produces the split number; settlement happens outside the app (InstaPay, Vodafone Cash, cash).
- Anyone outside the founder's friend group — v1 is not distributed publicly; it exists to run the 10-dinner validation test defined in the PRFAQ.

### 2.3 Key User Journeys

- **UJ-1. Radi splits a dinner for six without breaking stride.**
  - **Persona + context:** Radi (the founder), out with five friends. The bill lands: mixed food and drinks, a couple of shared platters, and this restaurant charges both tax and service.
  - **Entry state:** No login. Opens hasebly cold, taps the camera icon.
  - **Path:** (1) Photographs the receipt. (2) hasebly shows the extracted items and asks him to confirm tax and service — he taps to confirm both apply and adjusts the service rate slightly since this place charges 10%, not the default 12%. (3) He taps through the item list, assigning each item to whoever ordered it — a shared platter gets tapped for three people. (4) hasebly shows the final review screen: each person's total, tax and service included. He spots one item OCR misread (a price off by a digit) and taps to fix it. (5) He confirms.
  - **Climax:** The split appears — six names, six exact amounts, tax and service correctly divided by what each person actually had. He didn't do any math.
  - **Resolution:** He pays the bill. He tells each friend what they owe; they send it back however they normally do (InstaPay, cash). Table gets up.
  - **Edge case:** If hasebly can't find any plausible line items in the photo (blurry, not a receipt, fully handwritten tab), it tells him directly rather than guessing, and he re-scans or gives up and does it manually for that one dinner.

- **UJ-2. Mariam gets told the number, not asked to do the math.** Mariam never opens hasebly herself — Radi tells her what she owes and she sends it over; the wait is shorter, and the number feels right since it accounts for her only having a Coke Zero. `[ASSUMPTION: brief secondary illustration, not a full app-surface journey — non-fronters are scoped out of v1's app surface per §2.2.]`

## 3. Glossary

- **Fronter** — Holds the receipt, photographs it, runs the split. The only active user of the v1 app surface.
- **Receipt** — The photographed bill for one table's order at one restaurant visit.
- **Item** — A single receipt line entry (name + price), extracted via OCR.
- **Assignment** — Tapping an item to the person(s) who ordered it; can have multiple assignees (shared item).
- **Subtotal** — Sum of item prices before tax and service.
- **Tax Rate / Service Rate** — Percentage charges confirmed by the fronter per receipt. Default 14%/12% `[ASSUMPTION: pre-fill defaults, not fixed constants — the OCR spike found real venues charging 10%, 0%, or other combinations]`, both independently toggleable and editable.
- **Printed Total** — The receipt's final printed total; the reconciliation ground truth (FR-10).
- **Split** — The final computed output: each person's exact owed amount for one receipt.
- **v1 Test Build** — This PRD's scope: the stripped-down build for the 10-dinner validation test. Distinct from the full press-release vision.

## 4. Features

### 4.1 Receipt Capture & Extraction
**Description:** The fronter photographs the physical receipt and hasebly extracts the line items and prices via OCR. Realizes UJ-1. `[ASSUMPTION: camera capture only for v1, no gallery/photo-library import — mirrors the immediacy of the "snap it right now" moment; not explicitly re-confirmed in this PRD pass]`

#### FR-1: Capture receipt photo
Fronter can open hasebly and capture a photo of a receipt via the device camera, with no sign-up or login step. Realizes UJ-1.

**Consequences (testable):**
- Camera opens directly from app launch with zero intermediate screens requiring authentication.
- No account creation, email, or password is requested at any point in this flow.

#### FR-2: Extract items and prices
System extracts item names, prices, and any explicit tax/service lines from the captured photo via OCR.

**Consequences (testable):**
- Extracted items are presented to the fronter as an editable list, not auto-committed.
- If explicit tax/service lines are present and legible on the receipt, their stated rate is pre-filled (see FR-4/FR-5) rather than defaulting blind.

#### FR-3: Handle unreadable or non-receipt photos
System detects when a photo yields no plausible line items and tells the fronter directly rather than producing a nonsense split.

**Consequences (testable):**
- If zero items are extracted, the fronter sees an explicit "couldn't read this receipt" state with the option to retry or enter items manually, not a blank or broken split screen.

**Out of Scope:** Sophisticated document classification (e.g., detecting "this is a utility bill, not a restaurant receipt") — a simple "no plausible items found" fallback is sufficient for v1. `[NON-GOAL for MVP]`

### 4.2 Tax & Service Configuration
**Description:** The fronter confirms what tax and service actually apply to this specific receipt and at what rate, since the OCR spike confirmed these vary by venue and are not safe to assume. This is a correctness-critical feature, not a convenience toggle. Realizes UJ-1.

#### FR-4: Confirm and adjust tax applicability and rate
Fronter can confirm whether tax applies to this receipt, with the rate pre-filled from an extracted explicit tax line (FR-2) or defaulting to 14% if not detected, and can edit the rate.

**Consequences (testable):**
- Toggling tax off removes it entirely from the split calculation.
- Editing the rate value immediately recalculates the preview split.

#### FR-5: Confirm and adjust service applicability and rate
Fronter can confirm whether service applies to this receipt, with the rate pre-filled from an extracted explicit service line (FR-2) or defaulting to 12%, and can edit the rate. Same consequences as FR-4.

#### FR-6: Compound tax on service-inclusive subtotal
When both tax and service apply, system calculates service on the item subtotal first, then calculates tax on the service-inclusive amount (subtotal + service) — not tax and service calculated independently on the raw subtotal.

**Consequences (testable):**
- For a receipt with subtotal S, service rate r_s, and tax rate r_t: service = S × r_s; tax = (S + service) × r_t; total = S + service + tax.
- Given the OCR spike's Greek Club Cairo example (S=184.00, r_s=12%, r_t=14%), system computes service=22.08, tax=28.85, total=234.93 — matching the printed receipt exactly.

**Out of Scope:** Detecting compounding order automatically from the receipt — v1 always compounds tax-on-service when both apply; there is no confirmed real-world counterexample from the spike, but this is flagged as an open question (§8) if one surfaces during the 10-dinner test.

### 4.3 Item Assignment
**Description:** Fronter assigns each item to whoever ordered it, including shared items. Realizes UJ-1.

#### FR-7: Assign items to people
Fronter can assign each item to one or more people from a per-split roster (added ad hoc, no pre-existing contacts/accounts required).

**Consequences (testable):**
- An item assigned to more than one person splits that item's cost evenly among just its assignees, not the whole table.
- An unassigned item is visually flagged before the fronter can proceed to review.

#### FR-8: Compute per-person fair share
System computes each person's total as their assigned items' cost plus their proportional share of tax and service (per FR-6), based only on what they were assigned.

**Consequences (testable):**
- Sum of all per-person totals equals the Printed Total (FR-10) within rounding tolerance.
- A person assigned only a shared item pays only their fractional share of that item's price and its tax/service portion, not a full share.

### 4.4 Review & Confirm
**Description:** The load-bearing trust step from the PRFAQ Customer FAQ — fronter reviews the full split and corrects anything OCR misread before it's final. Realizes UJ-1.

#### FR-9: Review and edit before finalizing
Fronter sees the full itemized list, confirmed tax/service, assignments, and computed per-person totals in one review screen, and can edit any item's name or price before confirming the split as final.

**Consequences (testable):**
- No split is presented to other people (i.e., no "final" state reachable) without passing through this review screen at least once.
- Editing a price on this screen immediately recalculates all downstream per-person totals.

#### FR-10: Reconcile against printed total
System displays the receipt's Printed Total alongside the computed sum of all items + tax + service, so the fronter can visually confirm they match before finalizing.

**Consequences (testable):**
- If the computed sum and Printed Total disagree by more than a small rounding tolerance, the discrepancy is visibly flagged to the fronter rather than silently hidden.
- System does not attempt to auto-correct or force a match — per the spike's Boxmeal Dahab finding, some receipts are internally inconsistent, and the printed total is treated as ground truth, not re-derived.

### 4.5 Split Output
**Description:** What each person owes. No payment is moved by hasebly. Realizes UJ-1.

#### FR-11: Display final split
System displays each person's final owed amount clearly enough for the fronter to relay it verbally or by showing their screen.

**Consequences (testable):**
- Each person's line shows their amount and, at minimum, that it includes their share of tax/service (not just a bare number with no context).

#### FR-12: No in-app payment movement
System does not integrate any payment rail or move money on behalf of any user in v1.

**Consequences (testable):**
- No payment SDK, bank integration, or InstaPay/Vodafone Cash API call exists anywhere in the v1 build.

**Feature-specific NFRs:**
- Total time from FR-1 (camera open) to FR-11 (split displayed) is a metric to observe during the 10-dinner test, not a hard requirement yet — the PRFAQ's "under a minute" claim is explicitly unverified pending this data (see §8).

### 4.6 Group Expenses `[Added 2026-07-29, Epic 2 — sprint-change-proposal]`
**Description:** Multi-person groups, phone/OTP authentication, and settle-up balance display — brought in-scope ahead of the original 10-dinner gate (see §6.2, §7).

#### FR-13: Phone number + OTP authentication
System authenticates a user via phone number and a one-time code (Twilio SMS).

**Consequences (testable):**
- Requesting a code sends an SMS one-time code via Twilio and issues a session token on successful verification.
- If Twilio credentials aren't configured in the environment, the one-time code is logged to the console instead of sent via SMS, so the flow remains testable in dev.

#### FR-14: Create and view groups
System lets an authenticated user create a group and view groups they belong to.

**Consequences (testable):**
- Creating a group requires a name and kind (household/trip/other) and lands the creator on the group's detail screen as a member.

#### FR-15: Invite a member to a group by phone number
System lets a group member invite someone by phone number, before that person has an account.

**Consequences (testable):**
- Inviting an unregistered phone number creates a pending membership (status: pending, no linked account) that becomes active once that phone number verifies via FR-13.

#### FR-16: Log an expense against a group
System routes a completed receipt split (FR-1–FR-11) to a group instead of only local history, when a group is selected.

**Consequences (testable):**
- The solo (no group selected) flow is unaffected and still saves locally — this feature is additive to Epic 1, not a replacement.
- A submitted group expense records which member paid and each member's computed share.

#### FR-17: Settle Up — display net and pairwise balances
System computes and displays, per group, who owes whom and how much across logged expenses. No payment is moved (FR-12 still applies).

**Consequences (testable):**
- Settle Up is display-only — no payment rail, SDK, or deep-link is triggered anywhere in this feature.

## 5. Non-Goals (Explicit)

- hasebly is not a payments product — it never moves money or integrates a payment rail, in v1 or the full vision (FR-12).
- hasebly is not a persistent expense ledger or Splitwise competitor for ongoing shared living costs — it is a single-session, one-receipt-at-a-time tool, by design, not just for v1.
- hasebly's core receipt-to-split flow (capture, extract, assign, review) remains fronter-only — only the person photographing the receipt runs that flow. Group membership, invites, and settle-up balances (Epic 2, added 2026-07-29) are visible to any invited member from their own device once they verify their phone number — this reverses the original "fronter-only app surface" restriction for the group/settle-up surface specifically (§2.2).
- hasebly does not attempt sophisticated receipt/document classification beyond a basic "no items found" fallback (FR-3).

## 6. MVP Scope

### 6.1 In Scope
- Camera-based receipt capture, no sign-up (FR-1).
- OCR extraction of items, prices, and explicit tax/service lines (FR-2).
- Basic non-receipt / unreadable-photo handling (FR-3).
- Tax and service applicability + rate confirmation, editable, defaulting to 14%/12% (FR-4, FR-5).
- Correct compounding tax-on-service calculation (FR-6).
- Per-item, multi-person assignment including shared items (FR-7, FR-8).
- Full review-and-edit step before any split is treated as final (FR-9).
- Reconciliation display against the receipt's printed total (FR-10).
- Final per-person split display (FR-11).
- One app, shipped to both iOS and Android from a single codebase `[ASSUMPTION: "one platform" clarified by the user to mean one app/one codebase, not restriction to a single OS — cross-platform framework choice deferred to architecture]`.
- Multi-person group accounts, invites, and settle-up balance display (FR-13–FR-17). `[Added 2026-07-29, Epic 2]`

### 6.2 Out of Scope for MVP
- **Account layer** — moved in-scope as of Epic 2 (sprint-change-proposal, 2026-07-29), ahead of the original 10-dinner gate. Built as phone-number + OTP authentication (Twilio), not the anonymous-auto-created-ID design the PRFAQ specified for the full vision — a deliberate deviation, since phone-first doubles as the invite mechanism (inviting someone by phone before they have an account). **Local split history (persisted receipt-by-receipt history) remains deferred** — only group membership and balances are in scope. See §4.6.
- **Ads / any monetization** — deferred to the same post-validation point. Ad placement (post-split-completion only, non-interleaved) is already decided in the PRFAQ for when it ships.
- **Smart/suggested item assignment** — manual tap-assign only for v1.
- **Live/shared multiplayer assignment** (each diner assigns their own items in real time) — 100% of assignment labor stays on the fronter for v1; flagged in the PRFAQ as an open tension for larger tables, not resolved here.
- **Public distribution** — v1 is friends-only, not published for general download.

## 7. Success Metrics

**Primary**
- **SM-1**: Across the founder's first 10 real group dinners using hasebly, the founder chooses hasebly over a calculator/manual split in at least 8 of them. Validates FR-1 through FR-11. Originally the PRFAQ's 10-dinner go/no-go gate for building anything past v1 — **superseded as of the Epic 2 sprint-change-proposal (2026-07-29): no longer blocks further scope**, but retained as a standing quality signal on the core loop.

**Secondary**
- **SM-2**: Zero instances across those 10 dinners where a friend catches a final split that doesn't match the printed receipt total after the review step. Validates FR-6, FR-9, FR-10 — this is the correctness bar the whole trust model depends on.
- **SM-3**: Across the first 5 real uses of the group/settle-up flow, at least one invited member (not the fronter) successfully logs in on their own device and views their balance without help. Validates FR-13–FR-17 — the multi-device claim underlying Epic 2. `[Added 2026-07-29]`

**Counter-metrics (do not optimize)**
- **SM-C1**: Time-to-split should not be reduced by skipping or rushing the review-and-confirm step (FR-9). Speed that trades away the correctness check defeats the purpose of SM-2. Counterbalances any future "make it faster" pressure once SM-1 looks good.

## 8. Open Questions

1. Cross-platform framework choice (React Native, Flutter, or other) for the single-codebase iOS+Android build — deferred to architecture. See addendum.
2. Production OCR service selection and its real-world cost/latency/accuracy — the spike used a general-purpose vision LLM as a legibility proxy, not the service that will actually ship. See addendum.
3. Whether tax-always-compounds-on-service (FR-6) holds universally, or whether a real counterexample surfaces during the 10-dinner test that requires a configurable compounding order.
4. Whether FR-3's simple "no items found" fallback is sufficient in practice, or whether the 10-dinner test surfaces a need for smarter handling.
5. What happens if the 10-dinner test fails (SM-1 or SM-2 not met) — no rework path is defined yet; out of this PRD's scope but worth flagging for the founder to think about before starting.

## 9. Assumptions Index

- §2.3 UJ-2 — Mariam's journey is included only as a brief secondary illustration, not a full app-surface journey, consistent with §2.2 scoping non-fronters out of v1.
- §4.1 — Camera capture only, no gallery/photo import, for v1.
- §3 / §4.2 — 14%/12% remain the pre-fill defaults for tax/service rate, not fixed constants, per the OCR spike's finding of real rate variance.
- §6.1 — "One platform" is interpreted as one app/one codebase shipping to both iOS and Android, per the user's clarification during this PRD session.
