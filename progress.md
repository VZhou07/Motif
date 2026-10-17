# Motif technical handoff

Plain-language summary: [STATUS.md](STATUS.md). Build Goal is ACTIVE (full P0, then P1 in order, then hardening; P2 excluded). The user is asleep or away: do not ask questions; reason through problems, using subagents for independent review. The camera is covered: never open the real webcam and never claim live-camera, comfort, speech-audibility or hands-free acceptance.

## Resume first (next agent)

1. Read all of `AGENTS.md`, `plan.md`, `reasoning.md` (R4–R6 matter most) and `.agents/skills/motif-checkpoint/SKILL.md`.
2. Run `git status` and `git log --oneline -n 10`. Expected: clean tree; compare with "Last passing commit" below. No processes or extra worktrees were left running.
3. On a fresh clone or another computer, do "Fresh clone setup" first. Then run the baseline checks below. All must pass before you change anything.
4. Continue with "Exact next work", step 1. Commit each small passing chunk on its own (one module, feature step, test set or doc update). Never push.

## Last passing commit

- Last code commit: `6e017d0 Reset idle timer on pause and resume` (Linux, session 3): tsc PASS; vitest 12 files/135 PASS; build and browser-check 12/12 PASS at `e848456`. Earlier: `e266183` verified on the original Windows machine (110 tests).
- History note: the large commit `e2da549 Add guided calibration app` was undone at the user's request and rebuilt as 34 small commits (`5c56db0 Add checkpoint skill` … `370af21 Add build handoff notes`) with an identical tree; each code commit passed tsc and its own tests. Nothing was pushed.

## Fresh clone setup (another computer)

- Gitignored, so a clone lacks them: `node_modules`, the face model and WASM (`public/models`, `public/mediapipe`, `public/runtime-assets.json`), `.cache`, `dist`, `test-results`.
- Use Node 22.12+ (24.13.1 was used). Run `npm ci`, then `npm run setup:assets` (downloads the public Face Landmarker model from storage.googleapis.com and copies the matching WASM from node_modules; no user data is sent). `npm run build` fails its asset check until this is done.
- `scripts/browser-check.mjs` launches an installed Chrome or Edge through Playwright. If neither exists, run `npx playwright install chromium` and add a bundled-Chromium fallback to its `launch()` helper as its own small commit.

## Baseline commands (repo root, any OS)

- `npx tsc --noEmit` · `npx vitest run` · `npm run build` (also checks the local model/WASM assets) · `node scripts/browser-check.mjs` (run after build; uses Chrome's synthetic fake camera `--use-fake-device-for-media-stream`, never the real webcam; screenshots go to gitignored `test-results/`).
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
| W7c discovery | TESTING (`w7c_test_review` running). Owner: session 3 coordinator. |
| W8 hardening | REVIEWING (R10 revision 2 under `r10_review`). |

## Exact next work (ordered)

1. DONE (session 3): W6 session tests (`describe('multiple gestures (R6)')`, 13 tests: add/cross-check/negative, interfering candidate, duplicate refusal, simultaneous movements, step mode, next across a boundary in fallback, idle fallback counting, previous, pause, one-movement mapping, Change controls/Keep current, Use previous, 4-movement reachability, 3-movement auto mapping, assisted, recalibration with a set). No session bugs found. Commits `b48b127`, `75f2ad1`, `5b9edcb`.
2. DONE: UI follow-ups `aa5db2e` (camera panel lists movements + actions), `3dcd476` (chooser disables used movements while adding), `c7e4e7f` (evidence labels cross-checks; evidence also shown on the comfort screen; App test scans mapping proposals).
3. DONE: W6 software verified; human acceptance pending. `w6_test_review` BLOCKING at `c7e4e7f` → fixes `3e85aa3`, `2cefb57`, `e848456` → re-check PASS (tsc, vitest 134, build, browser 12/12, mutants killed). Follow-up `6e017d0` (helper Pause/Resume reset the idle timer; 135 tests). Recorded in `reasoning.md` R6 review record and `plan.md`.
4. DONE: W7a software verified; human acceptance pending. Code `793068b`…`5e92fcc`; review BLOCKING (tests only) → `589654f`, `264baa2`, `fa56d76` → re-check PASS; order test strengthened after.
5. W7b IN PROGRESS: R8 revision 2 APPROVED (`d6a8e48`). Done: `8afc20c` runtime `cancelledId`/`cancelCause` (+`8a8bfd2` tests), `90bbb43` threshold fractions exported, `45fec4e` `expectedId` on attempts, `5e2ba20` `src/app/scoring.ts` (+tests), `b551628` session wiring (effort decision `comfortable-effort`, use counts, `tiring` stage + `never-mind`, proposals computed once with recommendation first, `proposeCustom`, snapshot `evidence`/`recommendation`), session tests `src/app/session.scoring.test.ts`. UI `df49a02` (TiringView, recommendation reasons, helper custom-controls form, per-movement evidence) + `7b3cd3d` App tests. Checks at `7b3cd3d`: tsc PASS, vitest 16 files/223 PASS, build PASS, browser 12/12 PASS. `w7b_test_review` BLOCKING (tests only) → `5464487` → re-check PASS. DONE: W7b software verified; human acceptance pending. Then W7c (R9) and W8 per `plan.md`.
6. W7c IN PROGRESS: R9 revision 2 APPROVED (`8cf414f`). Done: `3a66045` `src/app/discovery.ts` (+`6b23931` 15 tests), `4b63378` session stages `discover`/`discover-results` (`startDiscovery`, `discover`/`discover-again`/`full-list` decisions, `discovered:<i>[:<companion>]` targets), `src/app/session.discovery.test.ts` (7), `08a4a22` UI (ChooseView button, capture text, DiscoveryResultsView) + `d549617` App test. Checks at `d549617`: tsc PASS, vitest 18 files/251 PASS, build PASS, browser 12/12 PASS. NEXT: independent testing review `w7c_test_review`, fix, record (W7c software verified; human acceptance pending). Then W8 hardening: write R10 (demo Person A/B via profiles, permission errors, zero gestures, tracking loss, reload, speech absence, focus/contrast/reduced motion checks, supported environment + limitations doc, manual acceptance checklist), review, implement, test review.

## Known notes and risks

- Head-direction labels (+yaw = person's left, +pitch = chin down, +roll = right shoulder) are derived mathematically; real-camera confirmation pending.
- The 60 s baseline valid-time cap is effectively unreachable (the 5-interruption cap fires first); kept as defensive code.
- `.cache/superseded/Workspace.tsx` (gitignored, original machine only) is an earlier agent's unused UI draft; not needed.
- Git prints LF→CRLF warnings on add; harmless. Do not change Git config.

## Environment (original Windows machine; check your own)

- Node 24.13.1, npm 11.8.0, Chrome and Edge installed. Pinned deps in `package.json`/lockfile (React 19.3.1, Vite 8.3.4, TS 7.0.2, Vitest 5.0.5, Tailwind 4.3.3, MediaPipe tasks-vision 1.1.1, Playwright 1.64.1, jsdom 26.1.0).
- npm defaults to offline; network installs need native approval with command-local flags. No global config changes.
- Git author identity is configured locally (values not logged).
- Running processes/worktrees left by this session: none.

## Environment (Linux server, session 3, 2026-10-17)

- Linux x64, Node 24.18.0. `npm ci` + `npm run setup:assets` worked online. No Chrome/Edge installed: `scripts/browser-check.mjs` falls back to Playwright's bundled Chromium (revision 1248, already present in the default Playwright cache; otherwise `npx playwright install chromium`). Baseline at `c72dfd0`: tsc PASS, vitest 12 files/110 PASS, build PASS, browser-check 12/12 PASS.
- Coordinator: Claude Code (session 3). Commits from `f1291e7 Add bundled Chromium fallback` onward.
