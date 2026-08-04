# Story 2.1: Phone Number + OTP Authentication

Status: done

<!-- Retroactive documentation pass (2026-07-29): implementation predates this doc (see Dev Agent Record). Not a pre-implementation spec — code was read and documented as-built, then validated against Epic 2's acceptance criteria. -->

## Story

As a user (fronter or invited member),
I want to verify my identity with just my phone number and a one-time code,
so that I can access my groups without a password or sign-up form.

## Acceptance Criteria

1. Given I open the Groups flow without a session, when I enter my phone number, then hasebly sends a one-time code via SMS (Twilio) and shows the OTP verify screen (FR-13).
2. Given I've received a one-time code, when I enter the correct code on the OTP verify screen, then hasebly issues me a session token and signs me in, persisted securely on-device (FR-13).
3. Given Twilio credentials aren't configured in the environment, when a one-time code is requested, then the code is logged to the console instead of sent via SMS, so the flow remains testable in dev.

## Tasks / Subtasks

- [x] Phone entry UI validates Egyptian mobile format, normalizes to E.164, and requests a code (AC: #1)
  - [x] `client/app/screens/PhoneEntryScreen.tsx` — `isValidEgyptianMobile`/`toE164` from `client/app/domain/phone.ts`; calls `requestOtp` (`client/app/api/groupApi.ts`)
- [x] Backend issues and rate-limits OTP codes (AC: #1, #3)
  - [x] `routes/auth.ts:requestOtp` validates phone shape server-side, checks `isRateLimited` (3/10min, 8/24h — `db/otp.ts`), creates a hashed code (`createOtpCode`), sends via `sendOtpSms` (`sms.ts`)
  - [x] `sms.ts` — Twilio REST API via direct `fetch` (no SDK); falls back to `console.log` when `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` are unset (AC: #3)
- [x] OTP verify UI submits the code and signs in on success (AC: #2)
  - [x] `client/app/screens/OtpVerifyScreen.tsx` — calls `verifyOtp`, then `useAccount().signIn(...)`, then resets nav stack to `GroupList`
- [x] Backend verifies the code, creates/links the user, issues a session token (AC: #2)
  - [x] `routes/auth.ts:verifyOtp` → `verifyAndConsumeOtpCode` (`db/otp.ts`, hash-compare, max 5 attempts, single-use) → `getOrCreateUserByPhone` (`db/users.ts`) → on brand-new user, `activatePendingMembershipsForPhone` (`db/groups.ts`, links Story 2.3 pending invites) → `createAuthSession` (`db/authSessions.ts`, hashed token, 90-day TTL)
- [x] Client persists the signed-in session across app restarts (AC: #2)
  - [x] `client/app/domain/account.tsx` — `AccountProvider`/`useAccount`; bearer token in `expo-secure-store` (OS keychain), non-secret profile in `AsyncStorage` for immediate boot render
- [x] Screens wired into navigation
  - [x] `client/App.tsx:96,114-115` wraps the stack in `AccountProvider`, registers `PhoneEntry`/`OtpVerify`; `client/app/navigation/types.ts:13-14` types the route params
- [x] **Enhancement (2026-07-30, post-`done`):** Account/profile screen — closes a real gap found in production use: `users.display_name` existed in the schema but nothing ever set it, so every group creator/member showed up as their raw phone number instead of a name.
  - Backend: `db/users.ts` gains `getUserById`/`updateUserDisplayName` (the latter backfills the user's own `group_members.display_name` across every non-removed group they're in, not just the `users` row — otherwise changing your name would only affect groups created afterward). New `routes/account.ts` (`getAccountRoute`/`updateAccountRoute`) registered at `GET /me` / `POST /me` in `index.ts`.
  - Client: new `AccountScreen.tsx` — dual-mode (mandatory first-time name prompt via a `requireName` route param, vs. a normal editable screen reached from `GroupListScreen`'s new "Account" header button). Also finally wires up `account.tsx`'s previously-dead `signOut()` (see the now-resolved Defer item below) as a real button.
  - `OtpVerifyScreen` routes a fresh sign-in with no `display_name` to `Account` (`requireName: true`) instead of straight to `GroupList`. `GroupListScreen`'s focus effect independently redirects there too if a *pre-existing* signed-in session (predating this feature) still has no name — covers accounts created before this fix existed, not just fresh sign-ins.
  - Deployed to staging (`wrangler deploy --env staging`); `/me` verified live (401 without a token). Verified with `tsc --noEmit` from both `client/` and `client/backend/worker/` (clean).

### Review Findings

- [x] [Review][Patch] *(Decision resolved 2026-07-30: add an explicit gate — IMPLEMENTED.)* Twilio dev-fallback has no explicit environment gate beyond secret presence — `client/backend/worker/src/sms.ts:12-15`. **Fix implemented:** added `ENVIRONMENT?: string` to `Env` (`env.ts`); `wrangler.jsonc` now sets `vars.ENVIRONMENT = "production"` at the top level (default deploy) and `"staging"` under the `staging` env block; local `wrangler dev` has no `vars`, so `ENVIRONMENT` is `undefined` there. `sendOtpSms` (`sms.ts`) now checks `env.ENVIRONMENT === 'production'` when Twilio secrets are missing — if true, logs an error and returns `{ok: false}` instead of `{ok: true}`; `requestOtp` (`routes/auth.ts`) already turns any `{ok: false}` into a 502 `"Could not send the verification code."` response, so no change was needed there — the existing error path does the job once `sendOtpSms` stops lying about success. Staging intentionally still gets the console-log fallback (not production, no real users). Verified with `npx tsc --noEmit -p .` from `client/backend/worker/` (clean, exit 0).
- [x] [Review][Defer] `authMiddleware.ts:7-11`'s comment still says "every household route" — deferred, pre-existing, cosmetic leftover from the households→groups rename.
- [x] [Review][Defer] ~~`account.tsx`'s `signOut()` only clears local storage (AsyncStorage + SecureStore) with no server-side session revocation call~~ — **`signOut()` is no longer dead code** as of the Account screen enhancement above (2026-07-30) — `AccountScreen`'s "Sign Out" button now calls it. The original finding (no server-side session-token revocation on sign-out) still stands and remains deferred: the auth session row in `auth_sessions` isn't invalidated, only cleared client-side. Low real-world impact at this app's scale (friends-only, 90-day token TTL already caps exposure) but worth fixing if this ever needs to support "sign out this device remotely."
- [x] [Review][Dismiss] `randomOtpCode`'s `crypto.getRandomValues(Uint32Array) % 10**6` has a theoretical modulo bias (2^32 isn't divisible by 10^6) — dismissed as noise: the bias magnitude is roughly 1 part in 4.3 million, and brute-forcing the 6-digit space is already infeasible regardless given the 5-attempt cap and 3/10min + 8/24h rate limits (`db/otp.ts`).

## Dev Notes

- **Architecture:** Implements AD-6 (backend groups/accounts store, supersedes AD-1's original no-accounts prohibition for this surface — `ARCHITECTURE-SPINE.md`). The extraction proxy (AD-1) is untouched and remains stateless/unauthenticated; auth is a separate route family (`routes/auth.ts`) in the same Worker.
- **Security posture, better than the architecture doc implies:** neither OTP codes nor session tokens are stored in plaintext — `db/otp.ts`/`db/authSessions.ts` store `sha256Hex(...)` hashes only, so a leaked DB row hands out no usable credential. OTP verify is attempt-capped (5) and codes are single-use (`consumed_at`). This exceeds what AD-6 as drafted required and is worth folding into AD-6's rule text next time the architecture doc is touched.
- **Twilio dev fallback (`sms.ts`):** with no Twilio env vars set, `requestOtp` still returns `{status: "sent"}` and the code goes to the Worker's console log — this is what makes the flow testable via `wrangler dev` + curl before a real Twilio account exists. `env.ts` defines the three required vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
- **Pending-invite linkage:** `verifyOtp` only calls `activatePendingMembershipsForPhone` when the user row is brand-new (`!existingUser`) — an existing user re-verifying (e.g., new device) does not re-run this, which is correct since their memberships would already be active from their first sign-in. This is the mechanism Story 2.3 depends on.
- **A real, already-encountered platform gotcha (see `account.tsx:20-26`):** `expo-secure-store` keys must be alphanumeric + `.`/`-`/`_` only — no colon — unlike `AsyncStorage`. An earlier version apparently used a colon-containing key and threw inside `signIn()` on every platform (not just web), silently breaking sign-in right after a successful verify. Current code uses `ehsebly_authToken`. Worth a regression check if this key is ever renamed.
- **Naming residue:** `authMiddleware.ts:7-11`'s comment still says "every household route" — a leftover from the households→groups rename; harmless but stale, fix opportunistically.
- **Gap worth flagging, not blocking:** `verifyOtp`'s response is consumed by the client via a type-cast in `groupApi.ts` (per the earlier households/groups inventory pattern already noted in Epic 1's deferred-work log for `extractReceipt.ts`) — no runtime shape validation. Consistent with the rest of this codebase's existing risk posture, not a regression introduced by this story.

### Project Structure Notes

Matches the documented source tree: `app/screens` (UI), `app/domain` (client state/session — `account.tsx` sits alongside `session.tsx` as the account-level analog), `app/api` (backend contract), `backend/worker/src/{routes,db}` (Worker). No deviations found.

### References

- [Source: client/app/screens/PhoneEntryScreen.tsx]
- [Source: client/app/screens/OtpVerifyScreen.tsx]
- [Source: client/app/domain/account.tsx]
- [Source: client/backend/worker/src/routes/auth.ts]
- [Source: client/backend/worker/src/authMiddleware.ts]
- [Source: client/backend/worker/src/sms.ts]
- [Source: client/backend/worker/src/db/otp.ts]
- [Source: client/backend/worker/src/db/authSessions.ts]
- [Source: client/backend/worker/src/db/users.ts]
- [Source: client/backend/worker/migrations/0001_household_core.sql — users, otp_codes, auth_sessions tables]
- [Source: client/App.tsx#L96,L114-115]
- [Source: client/app/navigation/types.ts#L13-14]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-hasebly-2026-07-16/ARCHITECTURE-SPINE.md — AD-6]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.1]

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (retroactive documentation pass, 2026-07-29)

### Debug Log References

None — documentation-only pass, no code changes made.

### Completion Notes List

- Retroactive backfill against pre-existing, already-functional code (not a pre-implementation spec). Implementation predates this doc.
- All 3 ACs verified against actual code behavior, not assumed from the epic text.
- Security implementation (hashed codes/tokens, rate limits, attempt caps) exceeds what was formally required by AD-6 — flagged in Dev Notes as worth reflecting in the architecture doc later.
- One stale comment found (`authMiddleware.ts` still says "household") — cosmetic, not fixed in this pass since this is a documentation-only story.

### File List

- client/app/screens/PhoneEntryScreen.tsx (read)
- client/app/screens/OtpVerifyScreen.tsx (read)
- client/app/domain/account.tsx (read)
- client/backend/worker/src/routes/auth.ts (read)
- client/backend/worker/src/authMiddleware.ts (read)
- client/backend/worker/src/sms.ts (read, **modified** — ENVIRONMENT=production gate, 2026-07-30)
- client/backend/worker/src/env.ts (**modified** — added ENVIRONMENT field, 2026-07-30)
- client/backend/worker/wrangler.jsonc (**modified** — added vars.ENVIRONMENT per env, 2026-07-30)
- client/backend/worker/src/db/otp.ts (read)
- client/backend/worker/src/db/authSessions.ts (read)
- client/backend/worker/src/db/users.ts (read)
- client/backend/worker/migrations/0001_household_core.sql (read)
- client/App.tsx (read, relevant sections)
- client/app/navigation/types.ts (read, relevant sections)
