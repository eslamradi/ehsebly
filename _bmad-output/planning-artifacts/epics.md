---
stepsCompleted: [1, 2, 3]
inputDocuments: ["_bmad-output/planning-artifacts/prds/prd-hasebly-2026-07-16/prd.md", "_bmad-output/planning-artifacts/architecture/architecture-hasebly-2026-07-16/ARCHITECTURE-SPINE.md"]
---

# hasebly - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for hasebly's v1 test build, decomposing the requirements from the PRD and Architecture Spine into implementable stories. No UX design contract exists for this run (not produced for this project) — interaction detail is carried by the PRD's User Journey (UJ-1) and each FR's testable consequences.

## Requirements Inventory

### Functional Requirements

FR-1: Fronter can open hasebly and capture a photo of a receipt via the device camera, with no sign-up or login step.
FR-2: System extracts item names, prices, and any explicit tax/service lines from the captured photo via OCR.
FR-3: System detects when a photo yields no plausible line items and tells the fronter directly rather than producing a nonsense split.
FR-4: Fronter can confirm whether tax applies to this receipt, with the rate pre-filled from an extracted explicit tax line or defaulting to 14% if not detected, and can edit the rate.
FR-5: Fronter can confirm whether service applies to this receipt, with the rate pre-filled from an extracted explicit service line or defaulting to 12%, and can edit the rate.
FR-6: When both tax and service apply, system calculates service on the item subtotal first, then calculates tax on the service-inclusive amount (subtotal + service) — not tax and service calculated independently on the raw subtotal.
FR-7: Fronter can assign each item to one or more people from a per-split roster (added ad hoc, no pre-existing contacts/accounts required).
FR-8: System computes each person's total as their assigned items' cost plus their proportional share of tax and service, based only on what they were assigned.
FR-9: Fronter sees the full itemized list, confirmed tax/service, assignments, and computed per-person totals in one review screen, and can edit any item's name or price before confirming the split as final.
FR-10: System displays the receipt's Printed Total alongside the computed sum of all items + tax + service, so the fronter can visually confirm they match before finalizing.
FR-11: System displays each person's final owed amount clearly enough for the fronter to relay it verbally or by showing their screen.
FR-12: System does not integrate any payment rail or move money on behalf of any user in v1.
FR-13: System authenticates a user via phone number and a one-time code (Twilio SMS). `[Added 2026-07-29, Epic 2]`
FR-14: System lets an authenticated user create a group and view groups they belong to.
FR-15: System lets a group member invite someone by phone number, before that person has an account.
FR-16: System routes a completed receipt split (FR-1-FR-11) to a group instead of only local history, when a group is selected.
FR-17: System computes and displays, per group, who owes whom and how much across logged expenses. No payment is moved (FR-12 still applies).

### NonFunctional Requirements

NFR1: End-to-end time from receipt capture (FR-1) to split display (FR-11) is a metric to observe during the 10-dinner validation test — no hard performance target is set for v1; the PRFAQ's "under a minute" claim is explicitly unverified pending this data (PRD §4.5, §8).
NFR2 (from Architecture AD-3): All money arithmetic (prices, subtotals, tax, service, totals) must use integer minor currency units (piastres — EGP × 100), never floating point, with a single documented rounding rule (round-half-up) applied everywhere money is divided — prevents rounding drift that would break FR-8's and FR-10's reconciliation guarantees.
NFR3 (from Architecture AD-5): The vision-LLM API key must never be present in the client build or repo — it lives only in the backend's environment configuration.

### Additional Requirements

- **Starter/stack (Architecture Stack table):** Client is React Native via Expo (Expo SDK 56, React Native 0.85, current as of authoring). Client language is TypeScript. Client state for the split session uses React Context + hooks (no external state library). Backend runtime is Cloudflare Workers.
- **Paradigm (AD-1, AD-2):** Backend is a stateless extraction proxy only — no database, no persistence, no business logic. All split-domain logic (tax/service confirmation, FR-6 compounding, assignment, reconciliation) lives entirely client-side; the backend never receives or returns split results.
- **Extraction contract (AD-4):** Backend always returns one of two shapes to the client: `{status: "ok", items: [...], tax_line?, service_line?}` or `{status: "no_items_found"}` / `{status: "error", message}`. Client never receives a raw vendor payload — this decouples FR-3's handling from any specific vision-LLM provider's error format.
- **Security (AD-5):** No client-held secrets. The vision-LLM API key lives only in the Cloudflare Worker's environment secret store.
- **Naming (Consistency Conventions):** Code-level domain terms must match the PRD Glossary exactly (Fronter, Item, Assignment, Subtotal, Printed Total, Split) — no synonyms.
- **State mutation (Consistency Conventions):** Split-domain state is a single client-local session object, mutated only through the split-domain layer, never directly from UI event handlers — this is what guarantees FR-9's "editing recalculates all downstream totals" behavior.
- **Source tree (Structural Seed):** `app/screens` (UI per FR), `app/domain` (pure, unit-testable split-domain logic: compounding calc, assignment, reconciliation), `app/api` (API client implementing the AD-4 contract), `backend/worker` (Cloudflare Worker implementing the extraction proxy).
- **Deployment (Architecture "Deployment & environments"):** Single environment for v1 — no dev/staging/prod split. Client distributed via Expo EAS internal builds (TestFlight internal testing for iOS, direct APK or Play internal testing track for Android) — not published to public app stores, consistent with PRD §6.2's "no public distribution."
- **Data/persistence:** No database/server-side storage for the solo split flow (Epic 1, unchanged). Epic 2 adds a D1-backed groups/accounts/auth/settle-up surface per Architecture AD-6 — scoped separately from the extraction proxy. Local, receipt-by-receipt split history remains deferred (PRD §6.2).
- **Vision-LLM provider selection:** Deliberately left open behind the AD-4 contract (Architecture Deferred; PRD Open Question #2) — implementation must pick a current provider with structured/JSON vision output and evaluate cost-per-scan at actual test volume, but the choice is swappable and not fixed by this document.

### UX Design Requirements

No UX design contract was produced for this project — section intentionally empty. Interaction detail is carried by PRD §2.3 (UJ-1) and each FR's "Consequences (testable)."

### FR Coverage Map

FR-1: Epic 1 - Capture receipt photo, no sign-up
FR-2: Epic 1 - Extract items/prices/tax/service lines via vision-LLM proxy
FR-3: Epic 1 - Handle unreadable/non-receipt photos
FR-4: Epic 1 - Confirm and adjust tax applicability and rate
FR-5: Epic 1 - Confirm and adjust service applicability and rate
FR-6: Epic 1 - Compound tax on service-inclusive subtotal
FR-7: Epic 1 - Assign items to people, including shared items
FR-8: Epic 1 - Compute per-person fair share
FR-9: Epic 1 - Review and edit before finalizing
FR-10: Epic 1 - Reconcile against printed total
FR-11: Epic 1 - Display final split
FR-12: Epic 1 - No in-app payment movement (verified as an absence, not a dedicated build story)
FR-13: Epic 2 - Phone number + OTP authentication
FR-14: Epic 2 - Create and view groups
FR-15: Epic 2 - Invite a member to a group by phone number
FR-16: Epic 2 - Log a group expense (routes Epic 1's flow to a group)
FR-17: Epic 2 - Settle Up: display net and pairwise balances

## Epic List

### Epic 1: Fronter Gets an Accurate Split From a Photo
Fronter can point their phone at a real receipt and get an exact, trustworthy, fair split — accounting for whatever tax and service actually apply to that specific bill — in a few taps, without doing any math themselves.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12

### Epic 2: Friends Track and Settle Shared Group Expenses `[Added 2026-07-29, sprint-change-proposal]`
Any invited group member — not just the fronter — can install hasebly, verify their phone number, and see what they owe or are owed across a group's logged expenses, without hasebly ever moving money itself.
**FRs covered:** FR-13, FR-14, FR-15, FR-16, FR-17

## Epic 1: Fronter Gets an Accurate Split From a Photo

Fronter can point their phone at a real receipt and get an exact, trustworthy, fair split — accounting for whatever tax and service actually apply to that specific bill — in a few taps, without doing any math themselves.

### Story 1.1: Capture Receipt Photo

As a fronter,
I want to open hasebly and capture a photo of a receipt with no sign-up required,
So that I can start a split immediately, without any setup friction.

**Acceptance Criteria:**

**Given** hasebly is installed on my phone
**When** I open the app
**Then** I land directly on a camera capture screen with zero intermediate screens requiring authentication
**And** no account creation, email, or password is requested at any point in this flow (FR-1)

**Given** I am on the camera capture screen
**When** I take a photo of a receipt
**Then** the photo is held in-app and ready to send for extraction (continues in Story 1.2)

### Story 1.2: Extract Items via Vision-LLM Proxy

As a fronter,
I want hasebly to read the items, prices, and any tax/service lines off my photographed receipt,
So that I don't have to type anything in by hand.

**Acceptance Criteria:**

**Given** I've captured a receipt photo (Story 1.1)
**When** the photo is sent to the backend
**Then** the backend (Cloudflare Worker) calls the vision-LLM API and returns one of the two AD-4 contract shapes — `{status: "ok", items: [...], tax_line?, service_line?}` or a failure shape — never a raw vendor payload (FR-2)
**And** the vision-LLM API key is present only in the Worker's environment configuration, never in the client build (NFR3 / AD-5)

**Given** the photo yields plausible line items
**When** extraction succeeds
**Then** the extracted items are presented to the fronter as an editable list, not auto-committed (FR-2)
**And** if an explicit tax or service line was legible on the receipt, its stated rate is captured for pre-filling in Story 1.3, rather than defaulting blind

**Given** the photo is blurry, not a receipt, or otherwise yields zero plausible line items
**When** extraction is attempted
**Then** the fronter sees an explicit "couldn't read this receipt" state with the option to retry or enter items manually — not a blank or broken screen (FR-3)

### Story 1.3: Confirm Tax and Service Applicability and Rate

As a fronter,
I want to confirm whether tax and service actually apply to this receipt, and at what rate,
So that the split accounts for exactly what this venue really charges, not an assumed national average.

**Acceptance Criteria:**

**Given** items have been extracted (Story 1.2)
**When** I reach the tax/service confirmation step
**Then** tax defaults to 14% and service defaults to 12%, pre-filled from an explicit extracted line where one was detected (FR-4, FR-5)

**Given** I toggle tax or service off
**When** I do so
**Then** that charge is removed entirely from the split calculation (FR-4)

**Given** I edit the tax or service rate value
**When** I change it
**Then** the preview split recalculates immediately (FR-4, FR-5)

### Story 1.4: Compound Tax on Service-Inclusive Subtotal

As a fronter,
I want the tax to be calculated correctly relative to the service charge,
So that hasebly's total actually matches what the restaurant printed, not a naive flat sum.

**Acceptance Criteria:**

**Given** both tax and service apply to a receipt with subtotal S, service rate r_s, and tax rate r_t
**When** the split is calculated
**Then** service = S × r_s, tax = (S + service) × r_t, and total = S + service + tax — tax compounds on the service-inclusive amount, not independently on the raw subtotal (FR-6)

**Given** the Greek Club Cairo reference case (S=184.00, r_s=12%, r_t=14%)
**When** the calculation runs
**Then** it produces service=22.08, tax=28.85, total=234.93, matching the printed receipt exactly (FR-6 worked example)

**Given** any money value anywhere in this calculation
**When** it is stored or computed
**Then** it is represented as an integer minor currency unit (piastres) with round-half-up applied consistently — never a floating-point value (NFR2 / AD-3)

### Story 1.5: Assign Items to People, Including Shared Items

As a fronter,
I want to assign each item to whoever ordered it, including items shared by more than one person,
So that each person's share reflects what they actually had.

**Acceptance Criteria:**

**Given** the extracted item list and a roster of people I add ad hoc for this split
**When** I tap an item and select who had it
**Then** the item is assigned to that person (FR-7)

**Given** an item was shared
**When** I assign it to more than one person
**Then** its cost splits evenly among just its assignees, not the whole table (FR-7)

**Given** an item has not yet been assigned to anyone
**When** I attempt to proceed to review
**Then** the unassigned item is visually flagged and I cannot proceed past it silently (FR-7)

**Given** all items are assigned
**When** totals are computed
**Then** each person's total equals their assigned items' cost plus their proportional share of tax and service, based only on what they were assigned (FR-8)

### Story 1.6: Review, Edit, and Reconcile Before Finalizing

As a fronter,
I want to review the full split and fix anything OCR misread before it's final,
So that I can trust the numbers enough to actually pay and tell my friends what they owe.

**Acceptance Criteria:**

**Given** I've assigned all items (Story 1.5)
**When** I reach the review screen
**Then** I see the full itemized list, confirmed tax/service, assignments, and computed per-person totals in one place (FR-9)

**Given** I spot a misread item name or price on the review screen
**When** I edit it
**Then** all downstream per-person totals recalculate immediately (FR-9)

**Given** I have not yet passed through the review screen
**When** any part of the app attempts to show the split to other people
**Then** that "final" state is unreachable — review is mandatory, not skippable (FR-9)

**Given** the review screen is showing
**When** the computed sum of items + tax + service disagrees with the receipt's Printed Total by more than a small rounding tolerance
**Then** the discrepancy is visibly flagged to the fronter, not silently hidden — and the system does not attempt to auto-correct or force a match (FR-10)

### Story 1.7: Display Final Split

As a fronter,
I want to see each person's exact final amount clearly,
So that I can tell them what they owe or show them my screen directly.

**Acceptance Criteria:**

**Given** the split has been reviewed and confirmed (Story 1.6)
**When** I view the final split screen
**Then** each person's line shows their amount and makes clear it includes their share of tax/service — not a bare number with no context (FR-11)

**Given** the final split is displayed
**When** I look for any way to pay someone through the app
**Then** no such option exists anywhere in the app — hasebly never integrates a payment rail or moves money on behalf of any user (FR-12)

## Epic 2: Friends Track and Settle Shared Group Expenses

Any invited group member — not just the fronter — can install hasebly, verify their phone number, and see what they owe or are owed across a group's logged expenses, without hasebly ever moving money itself.

### Story 2.1: Phone Number + OTP Authentication

As a user (fronter or invited member),
I want to verify my identity with just my phone number and a one-time code,
So that I can access my groups without a password or sign-up form.

**Acceptance Criteria:**

**Given** I open the Groups flow without a session
**When** I enter my phone number
**Then** hasebly sends a one-time code via SMS (Twilio) and shows the OTP verify screen (FR-13)

**Given** I've received a one-time code
**When** I enter the correct code on the OTP verify screen
**Then** hasebly issues me a session token and signs me in, persisted securely on-device (FR-13)

**Given** Twilio credentials aren't configured in the environment
**When** a one-time code is requested
**Then** the code is logged to the console instead of sent via SMS, so the flow remains testable in dev

### Story 2.2: Create and List Groups

As an authenticated user,
I want to create a group and see the groups I belong to,
So that I have a place to log and track shared expenses with specific people.

**Acceptance Criteria:**

**Given** I'm signed in with no groups yet
**When** I open the Groups list
**Then** I see an empty state with an option to create a group (FR-14)

**Given** I create a group
**When** I submit a name and kind (household/trip/other)
**Then** the group is created and I land on its detail screen as a member (FR-14)

### Story 2.3: Invite a Member to a Group

As a group member,
I want to invite someone by phone number,
So that they can join and see the group's expenses even before they have an account.

**Acceptance Criteria:**

**Given** I'm viewing a group I belong to
**When** I invite a phone number that has no account yet
**Then** a pending group_member record is created for that phone number (status: pending, user_id: null) (FR-15)

**Given** an invited phone number later verifies via OTP (Story 2.1)
**When** they sign in
**Then** their pending membership is linked to their new account and its status becomes active

### Story 2.4: Log a Group Expense

As a fronter who is also a group member,
I want to route a completed split (Stories 1.1–1.7) to a group instead of only local history,
So that the group has a shared record of who paid and what was owed.

**Acceptance Criteria:**

**Given** I've completed the Capture → Extract → Tax/Service → Assign → Review flow (Epic 1) with a group selected
**When** I reach the Final Split screen
**Then** the split is submitted to the group via the backend instead of saved to local-only history (FR-16)
**And** the solo (no group selected) flow is unaffected and still saves locally (regression guard on Epic 1)

**Given** a group expense is submitted
**When** it's saved
**Then** it records which member paid (paid_by_member_id) and each member's computed share

### Story 2.5: View Group Detail and Expense History

As a group member,
I want to see a group's members and its logged expenses,
So that I understand the shared spending before settling up.

**Acceptance Criteria:**

**Given** I'm a member of a group
**When** I open its detail screen
**Then** I see its member list (with status: pending/active/removed) and its logged expenses

### Story 2.6: Settle Up — Net and Pairwise Balances

As a group member,
I want to see who owes whom and how much across the group's logged expenses,
So that we can settle up outside the app (InstaPay, Vodafone Cash, cash) without doing the math ourselves.

**Acceptance Criteria:**

**Given** a group has one or more logged expenses
**When** I open Settle Up
**Then** hasebly displays each member's net balance and each pair's net directed debt (FR-17) `[Revised 2026-07-30, code-review decision: debt-list minimization to a minimal transaction set is deferred to a follow-up story — see Story 2.6's Review Findings]`

**Given** Settle Up is displayed
**When** I view it
**Then** no payment is initiated, moved, or deep-linked anywhere — display only (FR-12, FR-17)
