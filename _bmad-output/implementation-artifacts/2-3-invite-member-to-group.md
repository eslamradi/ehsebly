# Story 2.3: Invite a Member to a Group

Status: done

<!-- Retroactive documentation pass: implementation already existed in the working tree
     before this story file was created. This is not a pre-implementation spec — it
     documents what was built, so it can go through bmad-code-review like Epic 1's stories did. -->

## Story

As a group member,
I want to invite someone by phone number,
So that they can join and see the group's expenses even before they have an account.

## Acceptance Criteria

1. **Given** I'm viewing a group I belong to, **when** I invite a phone number that has no account yet, **then** a pending `group_members` record is created for that phone number (`status: pending`, `user_id: null`) (FR-15).
2. **Given** an invited phone number later verifies via OTP (Story 2.1), **when** they sign in, **then** their pending membership is linked to their new account and its status becomes `active`.

## Tasks / Subtasks

- [x] Build `InviteMemberScreen` — name + Egyptian mobile number form, client-side validation via `isValidEgyptianMobile`/`toE164` (AC: #1) — `client/app/screens/InviteMemberScreen.tsx`
- [x] Add `inviteMemberRoute` — authenticated, membership-gated backend handler (AC: #1) — `client/backend/worker/src/routes/groups.ts:56-72`
- [x] Add `inviteMember()` DB function — dedupes against existing non-removed rows for `(group_id, phone_e164)`, branches active-vs-pending based on whether a `users` row already exists for that phone (AC: #1) — `client/backend/worker/src/db/groups.ts:64-90`
- [x] Add `activatePendingMembershipsForPhone()` — flips all pending rows for a phone to active + links `user_id`, called from the OTP-verify path (AC: #2) — `client/backend/worker/src/db/groups.ts:96-103`, wired at `client/backend/worker/src/routes/auth.ts:52-55`
- [x] Wire `InviteMember` into the navigator, reachable from `GroupDetailScreen` — `client/App.tsx:119`
- [x] **Fix (2026-07-30, during this review pass):** existing-user invites now go through the same pending→explicit-accept lifecycle as new-user invites, closing the no-consent gap — `client/backend/worker/src/db/groups.ts` (`inviteMember`, `acceptGroupInvite`, `listPendingGroupsForUser`), `client/backend/worker/src/routes/groups.ts` (`acceptGroupInviteRoute`, `listGroupsRoute`), `client/backend/worker/src/index.ts` (route registration), `client/app/api/groupTypes.ts`/`groupApi.ts` (`AcceptGroupInviteResponse`, `acceptGroupInvite`, `listGroups` return shape), `client/app/screens/GroupListScreen.tsx` (Pending invites UI). Verified with `tsc --noEmit` from both `client/` and `client/backend/worker/` (both clean).
- [x] **Enhancement (2026-07-30, post-`done`):** "Choose from Contacts" button on `InviteMemberScreen` prefills name + phone from the device's native contact picker, so the fronter doesn't have to hand-type a friend's number. Uses `expo-contacts`' `presentContactPickerAsync()` (native OS picker, out-of-process) rather than `getContactsAsync` — needs no Contacts permission grant on either platform, only the plugin entry in `app.json`. New `normalizeContactPhoneToLocal()` (`client/app/domain/phone.ts`) parses whatever format a contact stores (with/without `+20`/`0020` country code prefix, spaces/dashes) into the local `isValidEgyptianMobile` format; falls back to manual entry with an explicit error if no phone number on the contact resolves to a valid Egyptian mobile. Web has no picker implementation in `expo-contacts` — wrapped in try/catch so it degrades to the same manual-entry fallback instead of an unhandled rejection. Not required by any AC; purely a UX improvement on top of the already-`done` invite flow. Verified with `tsc --noEmit` from `client/` (clean).
- [x] **Bugfix (2026-07-30):** the contact-picker enhancement above didn't populate the name field. Root cause traced into `expo-contacts`' own iOS native source (`ios/ContactsModule.swift`'s `didPickContact` → `Serialization.swift`'s `serializeContact(keys: nil)`): the default field list `contactKeysToFetch(from: nil)` derives from a mapping dictionary that has no `"name"` entry at all, so the combined `name` field is structurally never serialized for `presentContactPickerAsync()` results — only `firstName`/`middleName`/`lastName`, which are set unconditionally in the same function. **Fix:** `InviteMemberScreen.tsx`'s `handlePickContact` now composes the display name from `firstName`/`middleName`/`lastName` (falling back to `contact.name` first, for forward-compatibility / other platforms) instead of trusting `contact.name` alone. Verified with `tsc --noEmit` from `client/` (clean).

### Review Findings

*(Blind Hunter layer failed to report/timed out — findings below are from Edge Case Hunter + Acceptance Auditor only. Findings about `createGroupRoute`, `isValidSubmitExpenseInput`/`submitExpenseRoute`, `listGroupsForUser` pagination, and cross-story schema concerns were raised by the review layers but are out of this story's scope — `routes/groups.ts`/the migration are shared files; those findings belong to Stories 2.2 and 2.4's own reviews and are not duplicated here.)*

- [x] [Review][Patch] *(Decision resolved 2026-07-30: add a consent/accept step — IMPLEMENTED.)* Inviting an already-registered phone number silently grants active group membership with no consent step. **Fix implemented:** `inviteMember()` (`db/groups.ts`) now always inserts new invites as `status: 'pending'`, `joined_at: NULL`, regardless of whether the phone already has an account — the `existingUser ? 'active' : 'pending'` branch was removed. Added `acceptGroupInvite(env, groupId, userId)` (`db/groups.ts`) and `POST /groups/:groupId/accept` → `acceptGroupInviteRoute` (`routes/groups.ts`, registered in `index.ts`), gated by `requireAuth` only (not `requireGroupMember` — the caller isn't an active member yet). Added `listPendingGroupsForUser` and wired it into `listGroupsRoute` (`{status:'ok', groups, pending_groups}`). Client: `listGroups` now returns `{groups, pendingGroups}`; added `acceptGroupInvite` to `groupApi.ts`; `GroupListScreen` renders a "Pending invites" section above the active-groups list with an Accept button per invite, re-fetching the full list on accept. A brand-new phone's first-ever OTP verify still auto-activates via the existing `activatePendingMembershipsForPhone` (unchanged) — only the existing-user branch needed an explicit step.
- [x] [Review][Patch] Concurrent double-invite of the same phone can 500 instead of 409 — **IMPLEMENTED.** `inviteMember()`'s INSERT is now wrapped in try/catch; a `UNIQUE constraint failed` error re-queries the row's status and returns the same `already_active`/`already_pending` result the non-race path would have returned, instead of an unhandled 500. *(Note: Story 2.2's review flagged this exact TOCTOU independently — its fork's fix landed first with a simpler `'already_member'` sentinel; this fix supersedes it with the pending/active distinction from the patch above, since both changes touch the same function.)*
- [x] [Review][Patch] "Already a member" error message is inaccurate for a still-pending invitee — **IMPLEMENTED** as part of the patch above: `inviteMember` now returns `'already_active' | 'already_pending'` instead of a single `'already_member'` sentinel; `inviteMemberRoute` maps them to distinct messages ("That phone number is already a member." vs "That phone number has already been invited and hasn't joined yet."), both still 409.
- [x] [Review][Patch] No upper bound on `display_name` length in the invite payload — **IMPLEMENTED.** Added `MAX_DISPLAY_NAME_LENGTH = 100` in `routes/groups.ts`; `inviteMemberRoute` rejects with 400 if exceeded.
- [x] [Review][Patch] Missing session-expired feedback in `handleInvite` — **IMPLEMENTED.** `InviteMemberScreen.tsx`'s `if (!token)` branch now calls `setError('Your session expired — go back and sign in again.')` instead of silently returning.
- [x] [Review][Defer] Re-inviting a previously-removed member will violate the `UNIQUE(group_id, phone_e164)` constraint instead of succeeding [client/backend/worker/src/db/groups.ts, client/backend/worker/migrations/0002_rename_to_groups.sql] — deferred, pre-existing. `inviteMember`'s dedupe check excludes `status='removed'` rows, implying re-invite-after-removal should work, but the migration's `UNIQUE(group_id, phone_e164)` has no status qualifier, so a second insert for the same pair would throw. Currently unreachable — no route sets `status='removed'` yet (same gap already noted in this story's Dev Notes: no member-removal route exists).
- [x] [Review][Defer] No invite-specific rate limit [client/backend/worker/src/routes/groups.ts] — deferred, pre-existing, already flagged in this story's own Dev Notes during documentation.

## Dev Notes

- **Architecture compliance (AD-6):** this story's routes/tables live entirely inside the groups/accounts surface AD-6 carves out — `inviteMemberRoute` requires both `requireAuth` and `requireGroupMember` before touching `group_members`, keeping it separate from the stateless extraction proxy (AD-1).
- **Pending → active lifecycle (updated 2026-07-30):** `group_members.status` is `pending`/`active`/`removed` with a nullable `user_id` (migration `0002_rename_to_groups.sql`). `inviteMember()` now *always* inserts as `pending`/`joined_at: null`, regardless of whether the phone already has an account — it still looks up `users` by `phone_e164` and sets `user_id` immediately if found (so the row is discoverable by `listPendingGroupsForUser`), but activation requires an explicit step: either the phone's first-ever OTP verify (`activatePendingMembershipsForPhone`, unchanged, for brand-new accounts) or the new `acceptGroupInvite` action (for phones that already had an account at invite time).
- **Join point (Story 2.1 ↔ 2.3):** `verifyOtp` in `routes/auth.ts:44-58` only calls `activatePendingMembershipsForPhone` when `existingUser` was null before this verification — i.e. exactly on first-ever signup for that phone. `activatePendingMembershipsForPhone` (`db/groups.ts:96-103`) does a blanket `UPDATE ... WHERE phone_e164 = ? AND status = 'pending'`, so it activates pending memberships across *every* group that phone was invited to in one shot, not just one.
- **Duplicate-invite guard:** `inviteMember()` selects any existing `group_members` row for `(group_id, phone_e164)` with `status != 'removed'` and returns the sentinel `'already_member'` (mapped to HTTP 409) rather than inserting a second row — the DB also enforces this via `UNIQUE (group_id, phone_e164)` in the migration, so it's defense-in-depth, not the only guard.
- **Self-invite:** not explicitly special-cased in code, but harmless — the inviter is already an `active` member (guaranteed by `requireGroupMember` gating the route), so inviting their own number hits the same `existingMember` check and returns `already_member`.
- **Gaps found (flagging, not blocking):**
  - No way to revoke/cancel a pending invite or remove a member once invited — `status: 'removed'` exists as an enum value in the schema but no route sets it. A typo'd phone number invite is permanent until manually fixed in the DB.
  - No rate-limiting specific to the invite endpoint (distinct from the OTP request endpoint, which does have `isRateLimited` — see Story 2.1) — a member could spam invites to the same group.
  - Client's error surface is a single generic string from the server response (`result.message`); no per-field validation errors (e.g., distinguishing "bad phone format" from "already a member") beyond what the server's message text happens to say.

### Project Structure Notes

Matches the source tree Story 2.1/2.2 established: `app/screens` for UI, `app/api/groupApi.ts` for the client's fetch wrapper (`inviteMember` function, not read in full for this story — see Story 2.2/2.4 docs), `backend/worker/src/routes/groups.ts` + `db/groups.ts` for the backend surface, gated by `authMiddleware.ts`'s `requireGroupMember`. No deviation from the Epic 2 structure.

### References

- [Source: client/app/screens/InviteMemberScreen.tsx]
- [Source: client/backend/worker/src/routes/groups.ts#inviteMemberRoute]
- [Source: client/backend/worker/src/db/groups.ts#inviteMember, #activatePendingMembershipsForPhone]
- [Source: client/backend/worker/migrations/0002_rename_to_groups.sql#group_members]
- [Source: client/backend/worker/src/routes/auth.ts#verifyOtp]
- [Source: client/backend/worker/src/authMiddleware.ts#requireGroupMember]
- [Source: ARCHITECTURE-SPINE.md#AD-6]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (retroactive documentation pass, 2026-07-29)

### Debug Log References

None — documentation-only pass, no code changes made.

### Completion Notes List

- Retroactive backfill: code was already fully implemented and wired into navigation before this story file existed. This document was produced by reading the actual shipped files, not by designing the feature.
- Code review (2026-07-29/30) found 5 patch items, all now implemented — see Review Findings above. Two real gaps remain deferred (no invite revocation, no invite-specific rate limit) — logged in Dev Notes, consistent with this project's existing deferred-work-log pattern from Epic 1.
- Two other stories' review forks (2.2, 2.5) touched adjacent files concurrently (`routes/groups.ts`, `db/groups.ts`) — verified no conflicting overwrite; this story's `inviteMember`/`inviteMemberRoute` changes supersede 2.2's simpler TOCTOU-only fix to the same function, as noted inline above.

### File List

- client/app/screens/InviteMemberScreen.tsx (read, **modified** — session-expired feedback)
- client/backend/worker/src/routes/groups.ts (read, **modified** — accept route, message differentiation, name length cap)
- client/backend/worker/src/db/groups.ts (read, **modified** — pending-by-default invites, acceptGroupInvite, listPendingGroupsForUser, TOCTOU fix)
- client/backend/worker/src/index.ts (**modified** — registered accept route)
- client/app/api/groupTypes.ts (**modified** — AcceptGroupInviteResponse, pending_groups field)
- client/app/api/groupApi.ts (**modified** — acceptGroupInvite, listGroups return shape)
- client/app/screens/GroupListScreen.tsx (**modified** — Pending invites UI)
- client/backend/worker/migrations/0002_rename_to_groups.sql (read)
- client/backend/worker/src/routes/auth.ts (read)
- client/backend/worker/src/authMiddleware.ts (read)
- client/App.tsx (read, navigation wiring confirmed)
