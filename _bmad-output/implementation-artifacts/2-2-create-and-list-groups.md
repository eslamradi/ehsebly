# Story 2.2: Create and List Groups

Status: done

<!-- Retroactive documentation pass (2026-07-29): this story's implementation
was already complete when this doc was written (sprint-change-proposal-2026-07-29.md
formalized Epic 2 against pre-existing code). Dev Notes describe what was
built, not a forward-looking spec. -->

## Story

As an authenticated user,
I want to create a group and see the groups I belong to,
so that I have a place to log and track shared expenses with specific people.

## Acceptance Criteria

1. **Given** I'm signed in with no groups yet, **when** I open the Groups list, **then** I see an empty state with an option to create a group (FR-14).
2. **Given** I create a group, **when** I submit a name and kind (household/trip/other), **then** the group is created and I land on its detail screen as a member (FR-14).

## Tasks / Subtasks

- [x] Build `GroupListScreen` — fetches on focus via `listGroups`, shows loading / empty-state / list of group rows (name, kind, member count) (AC: #1) — `client/app/screens/GroupListScreen.tsx`
- [x] Build `CreateGroupScreen` — name input + kind chip picker (Household/Trip), client-side empty-name validation, submits via `createGroup`, navigates (`replace`) to `GroupDetail` on success (AC: #2) — `client/app/screens/CreateGroupScreen.tsx`
- [x] Domain types for `Group` / `GroupKind` / `GroupMember` — `client/app/domain/group.ts`
- [x] Client API layer (`createGroup`, `listGroups`, `getGroup`) with wire↔domain mapping — `client/app/api/groupApi.ts`, `client/app/api/groupTypes.ts`
- [x] Worker routes: `POST /groups` (create), `GET /groups` (list for authenticated user) — `client/backend/worker/src/routes/groups.ts`
- [x] DB layer: `createGroup` (batched insert of group + creator-as-first-active-member), `listGroupsForUser` (join + member-count subquery, filtered to `status='active'`) — `client/backend/worker/src/db/groups.ts`
- [x] Schema: `groups` table with `kind` CHECK constraint, `group_members` with `UNIQUE(group_id, phone_e164)` — `client/backend/worker/migrations/0002_rename_to_groups.sql`
- [x] Navigation wiring: `GroupList`, `CreateGroup`, `GroupDetail` routes registered — `client/app/navigation/types.ts:15-17`, `client/App.tsx:116-118`

### Review Findings

- [x] [Review][Patch] **FIXED (2026-07-30).** `CreateGroupScreen`'s kind picker omits `'other'`, contradicting AC #2's literal text — `KIND_OPTIONS` (`CreateGroupScreen.tsx`) only offered Household/Trip chips. Fix: added a third `{ value: 'other', label: 'Other' }` chip, same component/styling as the existing two.
- [x] [Review][Patch] **FIXED (2026-07-30).** `createGroupRoute` silently coerced any invalid/missing `kind` to `'household'` instead of rejecting (`routes/groups.ts`). Fix: an explicitly-provided-but-invalid `kind` now returns `400 {status:'error', message:'Invalid group kind.'}`; an omitted `kind` still defaults to `'household'` (that's a legitimate optional-field default, not the bug — the bug was silently swallowing a bad explicit value).
- [x] [Review][Patch] **FIXED (2026-07-30).** `inviteMember`'s check-then-insert had a TOCTOU race with no exception handling (`db/groups.ts`). Fix: wrapped the `INSERT` in try/catch; a `UNIQUE constraint failed` error is now caught and translated to the same `'already_member'` result the non-race path returns, instead of an unhandled 500. (Checked `2-3-invite-member-to-group.md` first — this fix was not yet claimed/implemented there, so implemented it here since this function lives in this story's file scope.)
- [x] [Review][Defer] No max-length or duplicate-name validation on group name — deferred, pre-existing pattern. `CreateGroupScreen.tsx` and `routes/groups.ts:150` both only check for empty/whitespace, no upper bound or uniqueness check. Consistent with this codebase's existing convention of not length-bounding other free-text fields (e.g. extracted item names, per `deferred-work.md`). Not a regression; candidate for future hardening if real names turn out to need it.

**Dismissed as noise (2):** `phone_e164` returned to fellow group members via `getGroupRoute`/`listGroupMembers` — intentional for an invite-by-phone friends app, not a leak. `createGroup`'s creator-membership subquery could theoretically read a NULL `phone_e164` — unreachable, since every authenticated user has a verified phone by construction of the auth flow (Story 2.1).

## Dev Notes

- **Auth**: both routes go through `requireAuth` (bearer session token, see Story 2.1) before touching the DB — no group data is readable without a valid session. Governed by Architecture AD-6.
- **Creator-as-member invariant**: `createGroup` (db/groups.ts:20-33) inserts the `groups` row and a `group_members` row for the creator in a single `env.DB.batch(...)` — the creator is always `status: 'active'` immediately, so they can log an expense against the group right after creating it (comment at db/groups.ts:22-23 states this explicitly). This is why `groupApi.ts:81`'s `createGroup` client function can safely hardcode `mapGroup(result.group, 1)` — member count is always exactly 1 at creation time.
- **`kind` values**: schema allows `'household' | 'trip' | 'other'` (migration line 21, `db/groups.ts:4`), and the Worker route validates against the same three-value list (`routes/groups.ts:10`). `CreateGroupScreen`'s `KIND_OPTIONS` now exposes all three as chips (fixed 2026-07-30, see Review Findings); an invalid explicit `kind` is rejected with 400 rather than silently coerced.
- **No duplicate-name protection**: nothing prevents creating two groups with the identical name for the same user — `GroupListScreen` would show two indistinguishable rows differentiated only by kind/member-count. Matches this codebase's existing pattern (Epic 1's person-roster also has no duplicate-name protection, per `deferred-work.md`).
- **No group name length cap**: client only checks `trimmed.length === 0` (CreateGroupScreen.tsx:57); Worker route mirrors this (`routes/groups.ts:21`, only checks `.length === 0`). An arbitrarily long name would be accepted by both layers.
- **List ordering**: `listGroupsForUser` orders by `g.created_at DESC` (db/groups.ts:42) — newest group first.

### Project Structure Notes

Matches the existing source tree exactly: `app/screens` (UI), `app/domain` (types), `app/api` (wire contract + client), `backend/worker/src/routes` + `backend/worker/src/db` (Worker). No structural deviation from Architecture's documented layout.

### References

- [Source: client/app/screens/CreateGroupScreen.tsx]
- [Source: client/app/screens/GroupListScreen.tsx]
- [Source: client/app/domain/group.ts]
- [Source: client/app/api/groupApi.ts#L79-99]
- [Source: client/app/api/groupTypes.ts#L12-32]
- [Source: client/backend/worker/src/routes/groups.ts#L12-37]
- [Source: client/backend/worker/src/db/groups.ts#L20-52]
- [Source: client/backend/worker/migrations/0002_rename_to_groups.sql#L18-24]
- [Source: ARCHITECTURE-SPINE.md — AD-6]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (retroactive documentation pass, 2026-07-29)

### Debug Log References

None — documentation-only pass, no code changes made.

### Completion Notes List

- Retroactive backfill: implementation pre-existed this story doc (see sprint-change-proposal-2026-07-29.md). All tasks above were verified against actual code, not planned.
- Two real gaps identified during this pass (see Dev Notes): no `'other'`-kind UI option, no duplicate-name or name-length validation. Neither blocks review; flagged for a future story if they surface as real friction.

### File List

- client/app/screens/CreateGroupScreen.tsx
- client/app/screens/GroupListScreen.tsx
- client/app/domain/group.ts
- client/app/api/groupApi.ts
- client/app/api/groupTypes.ts
- client/backend/worker/src/routes/groups.ts
- client/backend/worker/src/db/groups.ts
- client/backend/worker/migrations/0002_rename_to_groups.sql
- client/app/navigation/types.ts
- client/App.tsx
