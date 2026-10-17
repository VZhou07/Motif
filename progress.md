# Motif technical handoff

For the short plain-language update, read [STATUS.md](STATUS.md). Build Goal is ACTIVE. User is sleeping: do not ask questions. Camera is covered; no live-person camera, comfort, audio-audibility, or accessibility acceptance may be claimed.

## Resume first

1. Read AGENTS.md, plan.md, reasoning.md and .agents/skills/motif-checkpoint/SKILL.md.
2. Inspect Git status, tracked/untracked changes and any listed command sessions. Preserve other agents' work; transfer file ownership before editing.
3. Continue the first actionable unmet software criterion. Keep unavailable human checks pending and continue independent approved work.
4. Update this handoff and STATUS.md at milestones/before interruption. User approved short local verified commits; never push.

## Current state

- Approved scope: all P0, then P1 profiles/recalibration -> observed scoring/mapping recommendations -> verified free discovery -> hardening. P2 excluded.
- Goal created on user build instruction; no token/time budget specified beyond runtime limits.
- Last commit/base: e1bb56e (initial README). No application baseline passes yet. Planning/skill files are untracked.
- R1/R3 product/design approval and R2 skill verification are complete; historical details remain in reasoning.md.
- R4 revision1 APPROVED by build_review before code. Clarifications: one common preprocessor/reset per phase; any interruption invalidates a held-out positive attempt.

## Active owners (do not overlap writes)

Session 2 (Kiro coordinator, 2026-10-17 ~03:00) took over. The earlier face_tracker/core_engine/build_review workers are gone; their files were reconciled with the handoff and ownership transferred to the Kiro coordinator.

| Agent | Owned files | State / acceptance |
| --- | --- | --- |
| Kiro coordinator | everything (package/config/scripts, src/**, shared docs) | Implementing R5 UI orchestration after independent review. |
| Reviewers (subagents) | Read-only | Spawned per review; report to coordinator. |

Reconciled baseline (session 2, uncommitted, all untracked): tracker (FaceTracker, extractFeatures) and engine (features, calibration, recognition, verification, scanner) implemented with tests. `npx vitest run` 8 files/61 tests PASS; `npx tsc --noEmit` PASS; `npm run build` PASS (asset check OK). App.tsx is a placeholder; `scripts/browser-check.mjs` (referenced by `test:browser`) does not exist yet. No independent testing review of tracker/engine is recorded yet.

Recovered partial work: the earlier Codex root (process started 01:57, last write 02:59, idle since) had written `src/components/Workspace.tsx` against an older unreviewed `MotifState` and expanded `src/styles.css`. Workspace.tsx was moved, unchanged, to `.cache/superseded/Workspace.tsx` (gitignored) because it does not match the reviewed R5 session; its styles/copy/icons are reused by the new components.

## Checkpoints

| Item | State |
| --- | --- |
| W0/W1/WF1/WF2 | Reached (planning, skills, scope approval). |
| W2 camera/dashboard | Software verified; human acceptance pending (real webcam, live values, side/head-sign labels). |
| W3 calibration/one gesture | Software verified; human acceptance pending (real-person rest/training/checks, comfort). |
| W4/W5 communication/first-slice checks | Software verified; human acceptance pending (gesture-only compose/speak, speech audibility). Independent review: w2_w4_test_review → fixes → w2_w4_recheck PASS. |
| W6 remaining P0 | Authorized, planned. |
| W7a/b/c all P1 | Authorized, planned in that order. |
| W8 hardening | Authorized, planned; human checks pending. |

## Commands and environment

- Node24.13.1/npm11.8.0/Python3.11.9; Chrome/Edge installed; Claude CLI absent.
- npm default offline/proxy sandbox blocks network. Native-approved command-local online flags and a permitted cache work; registry/model HEAD preflight passed. Do not change global config.
- Current npm metadata: React19.3.1/Vite8.3.4/plugin-react6.1.2/TS7.0.2/Vitest5.0.5/Tailwind4.3.3/MediaPipe1.1.1. Use jsdom26.1.0 for Node compatibility.
- Local Git author name/email configured; no values logged. Commit only passed reviewed chunks.
- Windows power plan allows sleep45min AC/15min battery; user informed to keep machine awake. No OS settings changed.
- Running command sessions: none yet.
- Last checks: planning/skill validators,13 local links/2 imports/whitespace, independent reviews passed. No app tests/build yet.

## Exact next work

Session 2 progress (R5 rev2 approved; implementing):
- DONE (uncommitted): `fitGesture` settled-movement change + 4 tests; `src/app/{types,capture,movements,session}.ts`; `session.test-support.ts` + `session.test.ts` (23 tests: full gesture-only flow, interruption redo, held-out fail → new cycle, weak movement, negative fail/restart, tracking loss mid-dwell, hidden tab, watchdog, scan-boundary latch, once-per-hold, pause/resume, speed, recalibrate keep/cancel/replace, decision gating, no local speech, assisted Space). `npx vitest run src/app` PASS; engine PASS.
- DONE (uncommitted): `src/app/speech.ts` (+3 tests), `src/app/useMotif.ts`, `src/components/{Icon,CameraPanel,ScanBoard,SetupViews,ReviewViews,CommunicationView}.tsx`, `src/App.tsx` (+5 RTL tests in `src/App.test.tsx`), `index.html` inline favicon, `scripts/browser-check.mjs`.
- Evidence (session 2, ~07:10): `npx vitest run` 11 files/96 tests PASS; `npx tsc --noEmit` PASS; `npm run build` PASS; `node scripts/browser-check.mjs` (after build) 12/12 PASS on installed Chrome with `--use-fake-device-for-media-stream` (synthetic pattern; real webcam never opened): local model loads, inference reports `missing` face, rest check stays at 0% (fail closed), assisted Space adds "Yes", no storage, no off-device requests, reduced motion, keyboard focus, no console errors, camera denial explained. Screenshots in `test-results/` (gitignored).
- Review: w2_w4_test_review (BLOCKING: 3 test gaps) → fixed (cap 5, +7 tests, fewer live regions) → w2_w4_recheck PASS. Vitest 11 files/103 tests PASS; tsc PASS; build PASS; browser-check 12/12 PASS.
- NEXT: local commit "Add guided calibration app"; then W6 R6 design (two gestures: Next/Select, ambiguity, 3+ mappings, reapproval on mapping edits, one-gesture fallback).

Earlier plan (session 1):
1. Root writes package/config/asset setup and installs dependencies via native-approved network command.
2. Tracker/core workers implement their approved R4 modules; root builds camera dashboard then guided calibration/communication UI.
3. Run unit tests, typecheck/build, have independent reviewer run checks, fix blockers, and commit passing work locally.
4. Record remaining failures, active sessions, exact next action and last passing commit here before any interruption. Never claim covered-camera tests passed.
