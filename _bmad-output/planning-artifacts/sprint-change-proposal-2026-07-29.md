# Sprint Change Proposal — hasebly

**Date:** 2026-07-29
**Mode:** Incremental
**Trigger category:** Strategic pivot

## 1. Issue Summary

The working tree contains a large body of uncommitted, functionally-complete code (phone/OTP authentication, multi-person groups, invite-by-phone, and a Settle Up balance display) that was never routed through BMad's planning workflow — no epic, no stories, no PRD/architecture update. This code directly implements functionality the PRD's §6.2 "Out of Scope for MVP" explicitly deferred until after a 10-dinner validation gate (SM-1), and the Architecture Spine's AD-1 was written specifically to *prevent* a backend from gaining server-side storage or user accounts.

The founder has decided to build this "full vision" functionality now, ahead of the 10-dinner gate — a deliberate strategic pivot, not a failure signal from v1 usage. The account layer that was built deviates from the PRFAQ's original full-vision design (anonymous auto-created ID) in favor of direct phone number + OTP, which also serves as the invite mechanism. Critically, this reverses PRD Non-Goal #3 ("hasebly does not attempt to serve non-fronter users with their own app surface") — invited group members can install the app and log in on their own device to see their own balances, not just the fronter.

**Evidence:**
- `git status` shows: `households`→`groups` rename, 7 new screens (PhoneEntry, OtpVerify, CreateGroup, GroupList, GroupDetail, InviteMember, SettleUp), new domain files (`account.tsx`, `group.ts`, `groupLedger.ts`), migration `0002_rename_to_groups.sql`.
- Read-only code inventory confirmed: fully wired into `App.tsx`'s navigator (no orphaned screens), real Twilio SMS integration (with console-log dev fallback), backend routes match the D1 schema with no drift, and the feature is additive to Epic 1 (only `FinalSplitScreen` branches on an optional `session.group` field — the solo flow is untouched).
- The initial commit's own message already references "the in-progress household splitting feature (D1-backed accounts, groups, and ledger)" — this predates/parallels Epic 1, not a sudden departure.
- PRD FR-12 ("no in-app payment movement... in v1 or the full vision") remains satisfied — Settle Up is confirmed display-only, no payment rail or deep-link.

## 2. Impact Analysis

**Epic Impact:**
- Epic 1: Unaffected. Remains complete as originally planned; no retroactive changes to its stories or acceptance criteria.
- New Epic 2 required: "Friends Track and Settle Shared Group Expenses" (FR-13–FR-17), covering auth, group create/invite, group expense logging, and settle-up display.

**Artifact Conflicts:**
- **PRD**: §5 Non-Goal #3 and §6.2's account-layer deferral are both stale and need rewriting. FR list needs FR-13–FR-17 added. Success metric SM-1 (10-dinner gate) is superseded, not removed — retained as a quality signal, no longer a scope-blocking gate. New SM-3 added for the multi-device claim.
- **Architecture**: Direct, by-design conflict. AD-1 explicitly prevents "a future unit adding server-side storage, user accounts, or business logic to the backend." A new AD-6 is required to formally supersede that prohibition for the groups/accounts surface, while keeping the extraction proxy itself stateless and unauthenticated (AD-1 unchanged there). Frontmatter scope/binds and the Capability Map need extending to FR-17.
- **UX**: N/A — no UX design doc exists for this project (consistent with Epic 1, which also shipped without one).
- **Other**: `wrangler.jsonc` infra config changed; no new CI/testing gap introduced (ad hoc verify-scripts remain the established pattern, matching `verifyGroupBalances.ts` to `verifySplitCalculation.ts`).

**Technical Impact:** None outstanding — the code is already written and, per inventory, functionally sound (backend routes match schema, no drift). The gap is entirely in documentation and process: no story files, no code review.

## 3. Recommended Approach

**Selected approach: Hybrid** — Direct Adjustment (retroactively formalize Epic 2 + stories against the already-written code) combined with a required PRD + Architecture revision (not a silent edit, since AD-1's prohibition was intentional and by-design).

- Rollback (Option 2) was rejected — the user explicitly wants to keep and continue this work.
- A pure PRD/MVP scope reduction (Option 3) doesn't fit either — this is scope *expansion*, not reduction, but it does require the same rigor: the success-metric gate (SM-1) needs to be formally marked superseded rather than silently ignored.

**Effort:** Low for the documentation catch-up (code exists); Medium for closing the gap to `done` status (story-doc backfill + code review per story, matching Epic 1's proven cycle).
**Risk:** Low — the feature is additive to Epic 1, and inventory found no drift between backend routes and schema.

## 4. Detailed Change Proposals

### PRD (`prds/prd-hasebly-2026-07-16/prd.md`)
- **Edit A** — §5 Non-Goal #3 rewritten to scope the fronter-only restriction to the core receipt flow only; group/settle-up surface now explicitly multi-device. *(Approved)*
- **Edit B** — §6.2 account-layer bullet rewritten: moved in-scope as of Epic 2, phone+OTP (not anonymous-ID) noted as a deliberate deviation from the PRFAQ; local split history remains deferred. *(Approved)*
- **Edit C** — New §4.6 with FR-13–FR-17 definitions; §6.1 In Scope gains one line. *(Approved)*
- **Edit D** — SM-1 marked superseded (retained as quality signal, not a gate); new SM-3 added for the multi-device login claim. *(Approved)*

### Architecture (`architecture/architecture-hasebly-2026-07-16/ARCHITECTURE-SPINE.md`)
- **Edit E** — AD-1's "Prevents" clause amended to scope it to the extraction-proxy route only; new AD-6 added, formally superseding the broader prohibition for the groups/accounts surface. *(Approved)*
- **Edit F** — Frontmatter `scope`, `binds`, `updated` extended to cover FR-13–FR-17 and the D1-backed groups surface. *(Approved)*
- **Edit G** — Consistency Conventions rows, Capability → Architecture Map, and the Deferred section's PRD §6.2 bullet all updated to reflect the account layer now existing (phone+OTP). *(Approved)*

### Epics (`epics.md`)
- **Edit H** — Requirements Inventory gains FR-13–FR-17; FR Coverage Map updated; stale "no server-side storage" bullet in Additional Requirements corrected. *(Approved)*
- **Edit I** — New Epic 2 with Stories 2.1–2.6 (Phone/OTP Auth, Create/List Groups, Invite Member, Log Group Expense, View Group Detail, Settle Up), each with Given/When/Then acceptance criteria derived from the actual built behavior. *(Approved)*

### Sprint Status (`implementation-artifacts/sprint-status.yaml`)
- **Edit J** — `epic-2` and its six stories added with status `in-progress` (code exists, but no story doc or code review yet — matches Epic 1's proven `ready-for-dev → in-progress → review → done` lifecycle rather than jumping straight to `done`). *(Approved)*

## 5. Implementation Handoff

**Scope classification: Major** — the Architecture conflict is a deliberate, by-design prohibition being formally reversed (AD-6 superseding AD-1), which per this workflow's own classification rules requires Architect/PM-level sign-off on the document changes, even though the underlying code implementation is already complete.

**Handoff:**
1. **This workflow (Correct Course)** applies Edits A–J directly to the four documents, since exact text was drafted and explicitly approved item-by-item above — no further re-derivation needed.
2. **Developer agent (`bmad-create-story` + `bmad-dev-story` + `bmad-code-review`)** — for each of the six Epic 2 stories: backfill a proper story doc against the existing code (context, dev notes, file references), then run the same code-review cycle Epic 1's stories went through, before flipping status to `done`.
3. **Optional:** `bmad-retrospective` for Epic 1 remains open and independent of this change.

**Success criteria:** All six Epic 2 stories reach `done` status with a completed code-review pass and populated deferred-work log entries (matching Epic 1's pattern), PRD/Architecture/epics.md reflect the current build accurately, and `sprint-status.yaml` is the source of truth for both epics.
