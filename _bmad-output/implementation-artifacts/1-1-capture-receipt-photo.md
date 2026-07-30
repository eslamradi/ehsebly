---
baseline_commit: NO_VCS
---

# Story 1.1: Capture Receipt Photo

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a fronter,
I want to open hasebly and capture a photo of a receipt with no sign-up required,
so that I can start a split immediately, without any setup friction.

## Acceptance Criteria

1. Given hasebly is installed on my phone, When I open the app, Then I land directly on a camera capture screen with zero intermediate screens requiring authentication, and no account creation, email, or password is requested at any point in this flow. [Source: prd.md#FR-1; epics.md Story 1.1]
2. Given I am on the camera capture screen, When I take a photo of a receipt, Then I see a preview of the photo with the option to retake it or confirm it, and once confirmed the photo is held in-app and ready to send for extraction (handoff point — extraction itself is Story 1.2's scope, not this story's). [Source: epics.md Story 1.1]
3. Given the camera permission has not yet been granted, When I open the app for the first time, Then I am shown a clear, in-app explanation of why camera access is needed before (or as part of) the system permission prompt, and if I deny it, I see a state that explains capture isn't possible without it and offers a way to open device settings to change the decision — not a silent blank screen or a crash. [Source: Implementation Readiness Report 2026-07-16, Minor Concern #2 — this AC resolves a gap the PRD itself left open]

## Tasks / Subtasks

- [x] Task 1: Scaffold the Expo/React Native client project (AC: #1)
  - [x] Initialize an Expo SDK 57 (React Native 0.86.0) project with TypeScript (strict mode enabled — the Expo TS template default; keep it on for all 7 stories in this epic) — scaffolded via `create-expo-app` `blank-typescript` template into `client/`; actual installed versions (SDK 57.0.7) superseded the SDK 56 figure researched at story-authoring time, per Architecture's SEED rule
  - [x] Create the source tree per Architecture's Structural Seed: `app/screens`, `app/domain`, `app/api` (this story only populates `app/screens` and a minimal `app/domain`; `app/api` and `backend/worker` are Story 1.2's concern)
  - [x] Install React Navigation (native-stack) for the linear multi-screen flow this epic builds (capture → tax/service → assignment → review → split); `app/` here is a conventional source folder per Architecture's Structural Seed, not Expo Router's file-based routing — did not adopt Expo Router, avoiding a conflict with the `app/screens` layout — installed `@react-navigation/native` + `@react-navigation/native-stack` + `react-native-screens` + `react-native-safe-area-context` via `npx expo install`
  - [x] Configure native camera permission strings: `expo-camera`'s config plugin `cameraPermission` entry in `app.json`, which also sets iOS's `NSCameraUsageDescription` — without this, `useCameraPermissions`/`requestPermission()` crashes on iOS instead of returning "denied," which would break AC #3's manual verification
- [x] Task 2: Build the camera capture screen as the app's initial route (AC: #1, #3)
  - [x] Make the capture screen the first and only screen reachable on cold launch — no splash-to-login, no onboarding carousel, no account gate (`App.tsx` renders a single-route `Stack.Navigator` with `CaptureScreen` as the only screen)
  - [x] Request camera permission using the current Expo permissions API; handle granted, denied, and "denied and can't ask again" states distinctly (`app/screens/CaptureScreen.tsx` branches on `freshPermission.granted` / `canAskAgain`)
  - [x] On denied/blocked permission, show an explanatory state with a control that opens device settings (do not silently fail or show a blank camera preview) — `Linking.openSettings()`
  - [x] Render a live camera preview (back/rear-facing camera by default) with a capture control once permission is granted — `CameraView facing="back"`
- [x] Task 3: Preview, confirm, and hold the captured photo in session state (AC: #2)
  - [x] After shutter press, show a preview of the captured photo with retake / confirm controls — do not commit to session state on shutter-press alone (`pendingUri` state gates the preview; `setPhoto` is only called from `handleConfirm`)
  - [x] On confirm, store the captured photo (local URI) via a `app/domain` session-state action, held in a React Context provider — not set directly from the screen's `onPress` handler, and not via any external state library (Redux/Zustand/etc.) — per Architecture's Stack table, which mandates React Context + hooks with no external state library. This establishes the pattern from the first story, since every later story (1.2-1.7) builds on this same session object. (`app/domain/session.tsx`: `SplitSessionProvider` + `useSplitSession`)
  - [x] Do not persist the photo anywhere beyond in-memory session state (no disk cache beyond what the OS/camera library does transiently, no upload yet — that's Story 1.2) — confirmed: no AsyncStorage/SQLite/filesystem write anywhere in this story's code

### Review Findings

Three parallel adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor vs. this story + Architecture Spine) ran against the diff. 8 dismissed as noise/false-positive (mostly reviewers lacking full-repo context on files excluded from the scoped diff — `index.ts`, `tsconfig.json`, `package-lock.json`, and `assets/` all genuinely exist, just weren't part of this story's changed-file diff). 9 deferred as real-but-out-of-scope. 8 patches, all unambiguous — no decision-needed items.

- [x] [Review][Patch] Capture allowed before `onCameraReady` fires [client/app/screens/CaptureScreen.tsx] — expo-camera's own docs warn `takePictureAsync` must wait for `onCameraReady`; nothing currently gates the shutter button on it. Fixed: `cameraReady` state set via `onCameraReady`, gates and visually disables the shutter button.
- [x] [Review][Patch] `takePictureAsync` has no try/catch and no handling for an undefined/empty result [client/app/screens/CaptureScreen.tsx:handleCapture] — a hardware/OS failure produces a silent no-op with no user feedback. Fixed: wrapped in try/catch, missing `photo.uri` and thrown errors both surface a `captureError` banner.
- [x] [Review][Patch] No guard against rapid double-tap on the capture button [client/app/screens/CaptureScreen.tsx:handleCapture] — concurrent `takePictureAsync` calls can race. Fixed: `capturing` state guards re-entry and disables the button mid-capture.
- [x] [Review][Patch] Retake-after-confirm leaves a stale photo in session state, violating AC #2 [client/app/screens/CaptureScreen.tsx:handleRetake; client/app/domain/session.tsx] — `setPhoto` has no clear/reset counterpart, so confirming then retaking leaves `session.photoUri` pointing at the rejected photo even though the UI shows the live camera again. Fixed: added `clearPhoto` action to the session context, called from `handleRetake`.
- [x] [Review][Patch] `getPermission()` call in the `AppState` foreground listener has no try/catch [client/app/screens/CaptureScreen.tsx] — runs automatically on every foreground transition; an unhandled rejection there is a silent, recurring risk rather than a one-off user-triggered error. Fixed: wrapped in try/catch, falls back to previously-known permission state.
- [x] [Review][Patch] Inconsistent accessibility labels — only the shutter button has `accessibilityLabel`; "Grant camera access," "Open Settings," "Retake," and "Use Photo" do not [client/app/screens/CaptureScreen.tsx]. Fixed: all interactive `Pressable`s and preview `Image`s now have `accessibilityLabel`.
- [x] [Review][Patch] Unused `React` default import in both new files [client/app/domain/session.tsx; client/app/screens/CaptureScreen.tsx] — `tsconfig.base.json` sets `"jsx": "react-jsx"` (automatic runtime), so the default import is dead weight. Fixed: removed from both files.
- [x] [Review][Patch] Dev Agent Record File List labels `App.tsx`/`app.json`/`package.json` as "Modified" when the diff shows them as new files (no prior VCS baseline exists) — reword for accuracy. Fixed: File List section reworded below.
- [x] [Review][Defer] CameraView fully unmounts/reinitializes on every retake [client/app/screens/CaptureScreen.tsx] — deferred, perf/UX polish not correctness, no established pattern yet for keeping camera mounted across screen states.
- [x] [Review][Defer] No cleanup of temp photo files across repeated capture/retake cycles [client/app/screens/CaptureScreen.tsx] — deferred, real future storage-bloat concern but not reachable-in-one-session severity for a friends-only test build.
- [x] [Review][Defer] No receipt framing guide or flash control [client/app/screens/CaptureScreen.tsx] — deferred, product polish beyond Task 2's stated scope; revisit if the 10-dinner test surfaces real capture-quality problems.
- [x] [Review][Defer] Hardcoded `quality: 0.8` on `takePictureAsync` with no documented rationale [client/app/screens/CaptureScreen.tsx] — deferred, reasonable default; revisit against real OCR fidelity results in Story 1.2.
- [x] [Review][Defer] `predictiveBackGestureEnabled: false` and forced `userInterfaceStyle: "light"` are unexplained scaffold defaults [client/app.json] — deferred, pre-existing scaffold output, not introduced by this story's tasks, no dark-mode requirement exists yet.
- [x] [Review][Defer] `requestPermission()` and `Linking.openSettings()` calls have no try/catch [client/app/screens/CaptureScreen.tsx] — deferred, lower priority than the AppState-triggered case above since these are user-initiated and directly retriable by tapping the button again.
- [x] [Review][Defer] Tension between Architecture's Structural Seed ("domain/ = pure functions, unit-testable without the app shell") and the Stack table's React Context mandate, both applied to `app/domain/session.tsx` — deferred as guidance for Story 1.4+ (compounding calc/assignment/reconciliation should likely be pure functions the Context module calls into, distinct from state-holding modules like `session.tsx`), not a defect in this story's delivered scope.
- [x] [Review][Defer] Zero automated test coverage for the new screen's branching permission/capture states — deferred, consistent with this story's own Testing Requirements section and Architecture's explicit CI/testing-infrastructure deferral for v1.
- [x] [Review][Defer] No `testID`s on interactive elements — deferred, same reasoning (no E2E test infra exists yet for v1).

## Dev Notes

- **Architecture paradigm (binding for this story):** client-heavy layered app + stateless edge proxy [Source: ARCHITECTURE-SPINE.md#Design Paradigm]. This story is entirely client-side — no backend, no network call, no `backend/worker` code. Story 1.2 introduces the backend.
- **AD-2 (binding) + Stack table (binding):** all split-domain state mutation happens through the client's domain layer, never directly from UI event handlers [Source: ARCHITECTURE-SPINE.md#AD-2, Consistency Conventions], and that state is held in **React Context + hooks — no external state library** (Redux/Zustand/MobX/etc. are all out) [Source: ARCHITECTURE-SPINE.md#Stack]. Apply both now for the captured-photo reference even though the payoff (guaranteed-consistent recalculation) doesn't matter until later stories — the convention needs to exist before Story 1.6 depends on it holding everywhere.
- **No backend, no database, no persistence in this story or anywhere in v1** beyond the in-memory session [Source: ARCHITECTURE-SPINE.md#AD-1; prd.md §6.2]. Do not add AsyncStorage/SQLite/any persistence layer — it's explicitly out of scope for v1 and would contradict the PRD's deferred local-history feature.
- **No sign-up, login, or account UI anywhere in the app** [Source: prd.md#FR-1, §5 Non-Goals]. This is the differentiator the entire product is positioned on (see prfaq-hasebly.md) — treat it as a hard constraint, not a v1 shortcut to revisit later.
- **Camera-permission-denied handling (AC #3) is new scope added at story-creation time**, not explicitly specified in the PRD — the PRD left this open (flagged in the Implementation Readiness Report as Minor Concern #2, "the PRD doesn't specify behavior for it either"). This story makes the call: explain-then-redirect-to-settings, matching standard Expo-recommended permission UX, rather than leaving it undefined.
- **This is Epic 1 Story 1 — no starter template was named in Architecture** (only a stack: Expo SDK 57 / React Native 0.86.0 / TypeScript, confirmed at implementation time), so initialize a standard current Expo TypeScript project rather than cloning a specific named starter repo.

### Project Structure Notes

- Source tree per Architecture Structural Seed (scaffolded under `client/`, decided during this story to keep app code separate from the `_bmad/` planning-artifacts tree at the repo root):
  ```
  hasebly/
    client/
      app/
        screens/   # this story: capture screen
        domain/    # this story: minimal session-state module (photo reference)
        api/       # not touched this story — Story 1.2
      backend/
        worker/    # not touched this story — Story 1.2
  ```
- No conflicts detected — this is a greenfield project with no prior code, so there's nothing to reconcile against.

### Testing Requirements

- No CI/CD or automated test suite is required by Architecture for v1 — explicitly deferred as out of scope for a solo 10-dinner validation build [Source: ARCHITECTURE-SPINE.md#Deferred]. Manual verification on the founder's real device (both permission-granted and permission-denied paths) is the primary QA method for this story.
- Where cheap given Expo/RN's default Jest tooling, a unit test for the domain-layer session-state action (storing the photo reference) is good practice, but not a blocking requirement.

### Latest Technical Information

- **Camera capture API (Expo SDK 57):** use `expo-camera`'s `CameraView` component with the `useCameraPermissions` hook — this is the current maintained API (version synced to the SDK, e.g. `expo-camera` 57.x for SDK 57). The legacy `Camera` component no longer exists — use `CameraView` only. `expo-image-picker` is a valid library but only for system-picker/gallery flows or launching the native camera as a black box, not an in-app camera screen — since the PRD assumes camera-only capture with no gallery import [Source: prd.md §9 Assumptions Index], `expo-camera`'s `CameraView` is the correct choice, not `expo-image-picker`.
  ```js
  import { CameraView, useCameraPermissions } from 'expo-camera';
  const [permission, requestPermission] = useCameraPermissions();
  ```
- **Permission-denied pattern (grounds AC #3):** the returned `PermissionResponse` shape is `{ granted, status, expires, canAskAgain }`. If `permission === null`, permission state is still loading — render a placeholder, not the camera or an error. If `!permission.granted` and `permission.canAskAgain`, show a rationale UI with a button calling `requestPermission()` (re-shows the OS prompt). If `!permission.granted` and `!permission.canAskAgain` (permanently denied, or revoked in OS Settings), calling `requestPermission()` again silently no-ops — the app must instead show a message directing the user to Settings via `Linking.openSettings()`.
- **Known gap to guard against:** permission state doesn't always auto-refresh if the user grants/revokes it via the OS while the app is backgrounded (tracked upstream in Expo's GitHub issues[^1]). Re-check permission state on `AppState` foreground/focus, not only once on mount, or a user who grants permission from Settings and returns to the app may get stuck on the denied state.

  [^1]: expo/expo#28757, #28756, #36883
- **Not this story's scope, but flagged for Story 1.2:** `expo-image-manipulator`'s current API is a chainable context (`useImageManipulator` → `.resize()`/`.rotate()` → `.renderAsync()` → `.saveAsync()`), replacing the deprecated `manipulateAsync`. Resizing/compressing the photo before upload (max ~1500-2000px, moderate JPEG compression) is standard practice for a receipt-photo-then-OCR flow and worth deciding in Story 1.2, not here — `CameraView`'s own `takePictureAsync({ quality })` may be sufficient without a separate manipulation step.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx tsc --noEmit` — clean, no errors, after full implementation
- `npx expo-doctor` — 20/20 checks passed
- `npx expo export --platform ios` — bundled successfully, 836 modules, no errors (used as a runtime-validity check in lieu of a physical device/simulator, which isn't available in this environment)

### Completion Notes List

- Scaffolded the Expo/React Native client into `client/` (subfolder, not repo root — decided with the user during this story to keep app code separate from the `_bmad/` planning-artifacts tree; not the architecture spine's original literal diagram, which has been updated to match).
- **Version correction:** the story and architecture spine were authored assuming Expo SDK 56 / React Native 0.85 (researched ahead of actual release). The real `create-expo-app` install resolved **Expo SDK 57.0.7 / React Native 0.86.0** instead — SDK 57 shipped faster than research indicated. Updated the installed-version references in this story's Task 1, Dev Notes, and Latest Technical Information sections, and in `ARCHITECTURE-SPINE.md`'s Stack table and memlog, to match the actual installed reality per the spine's own "code owns this once it exists" rule. This is a factual correction to existing prose, not a scope change — disclosed here since the dev-story workflow's file-editing rules otherwise scope story-file edits to checkboxes/status/records.
- Implemented all 3 tasks: Expo scaffold + source tree + React Navigation + camera permission config (Task 1); permission-aware capture screen as the sole initial route (Task 2); shutter → preview → retake/confirm → session-state commit flow (Task 3).
- `useCameraPermissions` returns a 3-tuple (`[permission, requestPermission, getPermission]`), not the 2-tuple assumed during story research — used the third element (`getPermission`) for the AppState-foreground re-check (AC #3's "known gap" mitigation), which is cleaner than the originally-drafted workaround of importing a non-existent top-level `getCameraPermissionsAsync` (caught by `tsc`, corrected before completion).
- No automated tests were added: none of this story's 3 tasks include a testing subtask, and the story's own Testing Requirements section explicitly marks automated tests as "not a blocking requirement" for v1 (CI/testing infra is deferred per Architecture's Deferred section). Validated instead via clean `tsc`, `expo-doctor`, and a successful Metro bundle export.
- All three ACs are satisfied by the implementation: AC1 (camera screen is the sole cold-launch route, no auth) — `App.tsx`; AC2 (preview → retake/confirm → session commit) — `CaptureScreen.tsx` + `session.tsx`; AC3 (permission-denied handling with Settings deep-link) — `CaptureScreen.tsx`'s permission branches.
- **Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) ran post-implementation.** 8 patch findings applied: `onCameraReady` gate before capture is allowed, try/catch + user-visible error banner around `takePictureAsync`, a `capturing` guard against double-tap races, a `clearPhoto` session action so Retake-after-Confirm no longer leaves a stale photo in session state (this one was a genuine AC #2 violation caught by the Acceptance Auditor), a try/catch around the AppState-triggered permission re-check, `accessibilityLabel`s on every interactive element (previously only the shutter had one), removed unused `React` default imports (React 19's automatic JSX runtime makes them dead code), and reworded the File List's "Modified" language for files that are technically new adds under this repo's no-prior-commits state. 9 findings deferred to `deferred-work.md` (perf/polish/future-story items, all explicitly out of this story's 3-task scope). 8 dismissed — mostly reviewer false positives from not seeing files excluded from the scoped diff (`index.ts`, `tsconfig.json`, `package-lock.json`, `assets/` all genuinely exist). Re-validated after patches: `tsc --noEmit` clean, Metro bundle export clean (836 modules).

### File List

**New:**
- `client/app/domain/session.tsx`
- `client/app/screens/CaptureScreen.tsx`
- `client/app/api/` (empty directory, per Architecture Structural Seed — populated in Story 1.2)
- `client/backend/worker/` — not created; deferred to Story 1.2 per its own scope (Architecture backend is untouched by this story)

**Also new (no prior VCS history exists in this repo, so these are new files from git's perspective — the note below is about their conceptual origin, not their diff status):**
- `client/App.tsx` (started from the `create-expo-app` scaffold's default, then edited for navigation + session provider wiring)
- `client/app.json` (started from the scaffold default, then edited: renamed app to "hasebly"; added `expo-camera` config plugin with `cameraPermission` string)
- `client/package.json` / `client/package-lock.json` (started from the scaffold default, then edited: added `expo-camera`, `@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`, `react-native-safe-area-context`)

**Unmodified scaffold output (present, not edited):** `client/index.ts`, `client/tsconfig.json`, `client/.gitignore`, `client/LICENSE`, `client/assets/`

**Planning docs updated (version correction + scaffold-location decision, outside the story file):**
- `_bmad-output/planning-artifacts/architecture/architecture-hasebly-2026-07-16/ARCHITECTURE-SPINE.md`
- `_bmad-output/planning-artifacts/architecture/architecture-hasebly-2026-07-16/.memlog.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
