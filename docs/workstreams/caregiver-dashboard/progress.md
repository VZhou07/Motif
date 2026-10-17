# Caregiver dashboard handoff

Owner: this workstream (Agent 2). Branch `feature/caregiver-dashboard`, worktree `.cache/worktrees/caregiver-dashboard` (inside the main checkout's gitignored `.cache`), base `22aa5b4`. Never push; do not touch other worktrees or root journals.

State: **feature-ready (software verified); integration and hosted/two-device acceptance pending (Agent 3).** Design revision 3 independently APPROVED (rev 1: 8 blockers, rev 2: 1 blocker). Independent testing review: first FAIL (invite-expiry test passed only because the 2-minute retention cap dropped the board; plus gaps: two new ids per update, focus after Complete, slow cold start, same-account re-sign-in, `session_changed` start-up) → tests fixed (adb0bd3, 9e23d01) → re-check PASS: tsc, feature 87/87, full 46 files/583, build; 39+ mutations caught.

Files (all new, all owned here):
- `model.ts` — pure view model: names with stable `#n` tags, request merge by id/revision, group scoping, board ordering, ages, allowed next action, `AlertTracker`.
- `state.ts` — pure state machine: epochs, offline retention (2 min cap from last online snapshot), session discard rules, invitations, views.
- `useDashboard.ts` — subscribes to the shared client (`watch`, one `refresh`), 1 s tick.
- `sound.ts` — Web Audio created only on Enable sound.
- `CaregiverDashboard.tsx` + `caregiver.css` + `index.ts` — the screen to mount.
- Tests: `model.test.ts`, `state.test.ts`, `sound.test.ts`, `caregiver.css.test.ts`, `CaregiverDashboard.test.tsx` (fake client reproducing real shapes), `integration.test.tsx` (REAL `CareService` over a test transport). Test-only helpers: `fixtures.test-support.ts`, `client.test-support.ts`.

Coordinator checks (2026-10-17): `npx tsc --noEmit` PASS; `npx vitest run src/features/caregiver` 83 PASS; `npx vitest run` 46 files / 579 PASS; `npm run build` PASS (model/WASM assets copied from the main checkout's ignored `public/`, same MediaPipe version; `check:assets` passed). Self mutation probes caught: double-click guard (after strengthening the test), stale revision merge, epoch clearing, outage discarding the chime memory.

Commits after base: f813c9c, 44fdb5d, 1437d19, 7492339 (design + approval); 1f856c5 model, c8ab6b1 tests; 3b10c30 sound, ff1dbd8 tests; 46b5778 state, fc81d3b tests; 97bdf91 progress; 1a37c21 hook; 296d550 styles, ebe8fec tests; 60185ea screen; fc2fa48 test client; 29c557e screen tests; 72917b1 real-client tests.

Integration hooks for Agent 3: mount `<CaregiverDashboard client={sharedCareClient} />` (from `src/features/caregiver`) on the caregiver route; reuse the one shared client (a second `createSupabaseCareClient` for the same URL throws `client_exists`). Optional: hoist `KIND_LABELS`; add the caregiver e-mail to `CareAccess` if the account line should show it.

Last passing commit: 9e23d01 (code/tests). Pending (not claimed): hosted Supabase run, real two-device delivery, real browser audio audibility, screen-reader check. Next: Agent 3 mounts the screen on the caregiver route and runs the integrated acceptance; this workstream answers integration findings.
