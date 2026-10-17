# Motif technical handoff

Plain-language summary: [STATUS.md](STATUS.md). Build Goal: approved software scope COMPLETE as of session 3 (full P0, P1, hardening; P2 excluded); all human/hardware acceptance pending — see [ACCEPTANCE.md](ACCEPTANCE.md). The user is asleep or away: do not ask questions; reason through problems, using subagents for independent review. The camera is covered: never open the real webcam and never claim live-camera, comfort, speech-audibility or hands-free acceptance.

## Latest focused task — camera diagnostics and Rest / Action cues (R13)

- User reported calibration still fails; requested camera overlay, Rest↔Action beeps, Rest/Action only at five seconds each. Base `2ee25cf`. Focused task; overall Goal stays paused.
- State: **software verified; real-user calibration/comfort/beep audibility pending.** R13 revision 1 and 2 independently APPROVED by overlay_review before the matching code. Independent r13_testing BLOCKING (pending-at-boundary fixture) → fixture fix → recheck PASS. Coordinator: tsc PASS; vitest 31 files/353 PASS; `npm run build` PASS; tester also ran browser-check 67/67 with a synthetic camera.
- Behavior: trials alternate 5 s Rest / 5 s Action and share only the trailing Rest. Overlay shows live smoothed values, rest baseline, thresholds when learned, and recorded failure numbers. Low/high beeps on Rest/Action; mute on the camera panel. Held-out checks use an explicit Action window so shared Rest may begin in relaxation; last pre-Action frame must be `armed` and neutral; exactly one intended event inside Action.
- Next person step: refresh `npm run dev`, uncover the camera, run ACCEPTANCE.md 3.2 and 3.6, read the overlay if it still fails. No real camera was opened here. Nothing pushed.

## Previous focused task — return-to-rest rejection (R12)

- User reported all attempted movements fail "An attempt did not return to the personal resting baseline." Base `7914520`, clean tree at start. This authorized a focused fix; the earlier overall Goal stays paused.
- State: **T2 software verified; real-user calibration/comfort pending.** R12 revisions 1 and 2 independently APPROVED by rest_review before implementation; independent rest_tests final verdict PASS. All agents read the canonical checkpoint skill and four project docs. Worker ownership released; no partial code or running processes remain.
- Fix: preserve the original baseline, but permit rest variation bounded by noise/range or a quarter of the weakest personal movement. Judge the final third of the return instruction with at least 600 ms of valid, dense evidence. No signal-dependent tail search, held-out fitting or change to live recognition/approval gates.
- Reproduction: original code failed all 7 new session cases with the reported error; unit cases were 10 failing/5 passing. First fix passed 5 session cases but still failed both gradual head returns. Reviewed revision 2 then passed all 27 new tests without weakening the original head fixtures.
- Coordinator: `npm test -- src/engine/calibration.rest.test.ts src/app/session.rest.test.ts --reporter=dot` → 27 PASS; `npm run typecheck` PASS. Independent rest_tests: `npm test -- --reporter=dot` → 27 files/321 PASS; `npm run typecheck` PASS; `npm run build` → local assets/typecheck/production PASS. Coordinator: `node scripts/browser-check.mjs` → 67/67 PASS with a synthetic camera; clean exit, servers closed. Sandbox Vite spawn EPERM required native-approved execution as before.
- Coverage: quiet baseline then varied relaxed face, gradual recovery, brows/mouth and signed head directions, unchanged frozen models, no approval before held-out/negative checks, 60 s varied rest with no actions, one selection per long hold, genuine no-return and negative activation rejection, weak/strong attempts, opposite residuals, sparse return tails and timestamp boundaries. Independent in-memory probes caught five bad alternatives (old strict cap, removed gate, strongest-attempt cap, signed rest distance, old premature return window); shared files unchanged.
- Local commits: `e01b8d9 Fix relaxed gesture returns`, `1aeb492 Test relaxed gesture returns`, `e234992 Test calibration recovery`; documentation handoff follows. Nothing pushed.
- Next actionable criterion needs a person: refresh the app, repeat calibration with natural relaxation, and record ACCEPTANCE.md 3.6. The fixed 3-second return window still cannot accommodate every possible slow movement. No real camera was opened, and actual success/comfort is not claimed. No unresolved automated failures or new product decisions remain; await user feedback.

Previous T1 (R11): steady 3/3/3 rhythm, next-cue previews and coherent spoken cues were independently verified at `7914520` (294 tests and 67 browser checks). R12 addresses the user failure that ideal-stream T1 tests missed; R11 pacing stays in place.

## Resume first (next agent)

1. Read all of `AGENTS.md`, `plan.md`, `reasoning.md` (R13 revision 2 is the latest focused change) and `.agents/skills/motif-checkpoint/SKILL.md`.
2. Run `git status` and `git log --oneline -n 10`. Expected: compare with "Last passing commit" below. No processes or extra worktrees were left running.
3. On a fresh clone or another computer, do "Fresh clone setup" first. Then run the baseline checks below. All must pass before you change anything.
4. Continue with the first unfinished item in "Exact next work" (software scope is complete; remaining items are optional or need a person). Commit each small passing chunk on its own (one module, feature step, test set or doc update). Never push.

## Last passing commit

- Last passing code/test commits: `4b15c3b Add rest action diagnostics`, `ba253df Test rest action diagnostics`. Coordinator: typecheck PASS; vitest 31 files/353 PASS; build PASS. Independent r13_testing: tsc, 353 tests, build, browser 67/67, pending-at-boundary recheck PASS. Prior baseline `2ee25cf`.
- History note: the large commit `e2da549 Add guided calibration app` was undone at the user's request and rebuilt as 34 small commits (`5c56db0 Add checkpoint skill` … `370af21 Add build handoff notes`) with an identical tree; each code commit passed tsc and its own tests. Nothing was pushed.

## Fresh clone setup (another computer)

- Gitignored, so a clone lacks them: `node_modules`, the face model and WASM (`public/models`, `public/mediapipe`, `public/runtime-assets.json`), `.cache`, `dist`, `test-results`.
- Use Node 22.12+ (24.13.1 was used). Run `npm ci`, then `npm run setup:assets` (downloads the public Face Landmarker model from storage.googleapis.com and copies the matching WASM from node_modules; no user data is sent). `npm run build` fails its asset check until this is done.
- `scripts/browser-check.mjs` launches an installed Chrome or Edge through Playwright. If neither exists, run `npx playwright install chromium` and add a bundled-Chromium fallback to its `launch()` helper as its own small commit.

## Baseline commands (repo root, any OS)

- `npx tsc --noEmit` · `npx vitest run` · `npm run build` (also checks the local model/WASM assets) · `node scripts/browser-check.mjs` (run after build; uses Chrome's synthetic fake camera `--use-fake-device-for-media-stream`, never the real webcam; 67 checks incl. a dev-server run; `CHECK_DETAIL=all` lists every failing element; screenshots go to gitignored `test-results/`).
- Dev server for manual use: `npm run dev` (http://127.0.0.1:5173).
- Model/WASM assets live in gitignored `public/models` and `public/mediapipe`; if missing, run `npm run setup:assets` (needs network approval).

## Checkpoints

| Item | State |
| --- | --- |
| W0/W1/WF1/WF2 | Reached. |
| W2–W5 (camera, calibration, one-gesture communication, first slice) | Software verified; human acceptance pending (real webcam, live values, anatomical/head-direction labels, comfort, speech audibility). Reviews: r5_review → r5_rereview APPROVED; w2_w4_test_review → fixes → w2_w4_recheck PASS. |
| W6 remaining P0 (multi-gesture) | Software verified; human acceptance pending (`w6_test_review` re-check PASS at `e848456`). R6 revision 2 APPROVED (r6_review → r6_rereview). |
| W7a profiles/recalibration | Software verified; human acceptance pending (`w7a_test_review` re-check PASS at `fa56d76`). |
| W7b scoring/recommendations | Software verified; human acceptance pending (`w7b_test_review` re-check PASS at `5464487`). |
| W7c discovery | Software verified; human acceptance pending (`w7c_test_review` re-check PASS at `fefa186`). |
| W8 hardening | Software verified; human acceptance pending (`w8_test_review` re-check PASS at `8f22174`). |

## Exact next work (ordered)

1. DONE (session 3): W6 session tests (`describe('multiple gestures (R6)')`, 13 tests: add/cross-check/negative, interfering candidate, duplicate refusal, simultaneous movements, step mode, next across a boundary in fallback, idle fallback counting, previous, pause, one-movement mapping, Change controls/Keep current, Use previous, 4-movement reachability, 3-movement auto mapping, assisted, recalibration with a set). No session bugs found. Commits `b48b127`, `75f2ad1`, `5b9edcb`.
2. DONE: UI follow-ups `aa5db2e` (camera panel lists movements + actions), `3dcd476` (chooser disables used movements while adding), `c7e4e7f` (evidence labels cross-checks; evidence also shown on the comfort screen; App test scans mapping proposals).
3. DONE: W6 software verified; human acceptance pending. `w6_test_review` BLOCKING at `c7e4e7f` → fixes `3e85aa3`, `2cefb57`, `e848456` → re-check PASS (tsc, vitest 134, build, browser 12/12, mutants killed). Follow-up `6e017d0` (helper Pause/Resume reset the idle timer; 135 tests). Recorded in `reasoning.md` R6 review record and `plan.md`.
4. DONE: W7a software verified; human acceptance pending. Code `793068b`…`5e92fcc`; review BLOCKING (tests only) → `589654f`, `264baa2`, `fa56d76` → re-check PASS; order test strengthened after.
5. W7b IN PROGRESS: R8 revision 2 APPROVED (`d6a8e48`). Done: `8afc20c` runtime `cancelledId`/`cancelCause` (+`8a8bfd2` tests), `90bbb43` threshold fractions exported, `45fec4e` `expectedId` on attempts, `5e2ba20` `src/app/scoring.ts` (+tests), `b551628` session wiring (effort decision `comfortable-effort`, use counts, `tiring` stage + `never-mind`, proposals computed once with recommendation first, `proposeCustom`, snapshot `evidence`/`recommendation`), session tests `src/app/session.scoring.test.ts`. UI `df49a02` (TiringView, recommendation reasons, helper custom-controls form, per-movement evidence) + `7b3cd3d` App tests. Checks at `7b3cd3d`: tsc PASS, vitest 16 files/223 PASS, build PASS, browser 12/12 PASS. `w7b_test_review` BLOCKING (tests only) → `5464487` → re-check PASS. DONE: W7b software verified; human acceptance pending. Then W7c (R9) and W8 per `plan.md`.
6. W7c IN PROGRESS: R9 revision 2 APPROVED (`8cf414f`). Done: `3a66045` `src/app/discovery.ts` (+`6b23931` 15 tests), `4b63378` session stages `discover`/`discover-results` (`startDiscovery`, `discover`/`discover-again`/`full-list` decisions, `discovered:<i>[:<companion>]` targets), `src/app/session.discovery.test.ts` (7), `08a4a22` UI (ChooseView button, capture text, DiscoveryResultsView) + `d549617` App test. Checks at `d549617`: tsc PASS, vitest 18 files/251 PASS, build PASS, browser 12/12 PASS. `w7c_test_review` BLOCKING (tests only: chaining fixture, ranking/cap pinning, choice clearing, frame dropping) → `3529bad`, `4183a28`, `5588e48`, `8adc098`, `fefa186`; re-check PASS. DONE: W7c software verified; human acceptance pending.
7. DONE: W8 software verified; human acceptance pending (`w8_test_review` re-check PASS at `8f22174`; follow-ups `b46b63c`, `5303081`, `e40adc9`).
8. **Approved software scope complete (full P0 + P1 + hardening).** Every checkpoint W2–W8 is "software verified; human acceptance pending"; all plan.md boxes stay open until a person runs ACCEPTANCE.md with a real webcam. P2 remains excluded. Nothing was pushed (the user pushes).
9. If more time is available (optional, non-blocking leftovers from reviews): noisy-baseline pinning of the discovery `on`/`off` formulas (R9); defensive tests for counting a runtime `invalid` cause as unfinished (R8 M6/M8c); wording that a restored movement's practice strength dates from when it was trained (R8); browser check of target sizes on post-calibration screens is manual-only.

## Known notes and risks

- Head-direction labels (+yaw = person's left, +pitch = chin down, +roll = right shoulder) are derived mathematically; real-camera confirmation pending.
- The 60 s baseline valid-time cap is effectively unreachable (the 5-interruption cap fires first); kept as defensive code.
- `.cache/superseded/Workspace.tsx` (gitignored, original machine only) is an earlier agent's unused UI draft; not needed.
- Git prints LF→CRLF warnings on add (Windows); harmless. Do not change Git config.
- **Privacy correction (2026-10-17):** earlier checkpoint records said "no requests leave this device", but those browser runs lasted under 60 s and never closed the model. `@mediapipe/tasks-vision` 1.1.1 has built-in usage logging (counters, no images) that POSTs to `odml.pa.googleapis.com` every 60 s and on close; builds before `b070ba2` would have sent it in real use. Fixed by `src/tracker/offline.ts` (same-origin-only fetch/sendBeacon guard installed in `main.tsx`) plus a CSP meta in `index.html`; the browser check now stops the camera and proves the send was blocked.
- Two intermediate commits are not green on their own (no amend allowed): `3529bad` fails tsc (unused import, fixed in `4183a28`); `8adc098` has a failing App test (fixed in `fefa186`). Every other commit passed tsc and its tests.

## Environment (original Windows machine; check your own)

- Node 24.13.1, npm 11.8.0, Chrome and Edge installed. Pinned deps in `package.json`/lockfile (React 19.3.1, Vite 8.3.4, TS 7.0.2, Vitest 5.0.5, Tailwind 4.3.3, MediaPipe tasks-vision 1.1.1, Playwright 1.64.1, jsdom 26.1.0).
- npm defaults to offline; network installs need native approval with command-local flags. No global config changes.
- Git author identity is configured locally (values not logged).
- Running processes/worktrees left by this session: none.

## Environment (Linux server, session 3, 2026-10-17)

- Linux x64, Node 24.18.0. `npm ci` + `npm run setup:assets` worked online. No Chrome/Edge installed: `scripts/browser-check.mjs` falls back to Playwright's bundled Chromium (revision 1248, already present in the default Playwright cache; otherwise `npx playwright install chromium`). Baseline at `c72dfd0`: tsc PASS, vitest 12 files/110 PASS, build PASS, browser-check 12/12 PASS.
- Coordinator: Claude Code (session 3). Commits from `f1291e7 Add bundled Chromium fallback` onward.

- **User-directed change (2026-10-17, branch `fix-record-movement`):** one automatic profile ("Last setup", reserved name, no naming UI) saved on approval and scan-speed change; Continue restores it using saved resting summary numbers (no rest check, no movement re-checks, controls still need approval). This was done at the user's request without a separate reasoning review; independent review of the quick-restore path is still pending. Real-camera behaviour untested (camera covered).
