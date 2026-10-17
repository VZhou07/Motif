# Motif technical handoff

Plain-language summary: [STATUS.md](STATUS.md). Build Goal is ACTIVE (full P0, then P1 in order, then hardening; P2 excluded). The user is asleep or away: do not ask questions; reason through problems, using subagents for independent review. The camera is covered: never open the real webcam and never claim live-camera, comfort, speech-audibility or hands-free acceptance.

## Resume first (next agent)

1. Read all of `AGENTS.md`, `plan.md`, `reasoning.md` (R4–R6 matter most) and `.agents/skills/motif-checkpoint/SKILL.md`.
2. Run `git status` and `git log --oneline -n 10`. Expected: clean tree; the last code commit is `e266183 Add mapping confirmation screen` and newer commits are docs only. No processes or extra worktrees were left running.
3. On a fresh clone or another computer, do "Fresh clone setup" first. Then run the baseline checks below. All must pass before you change anything.
4. Continue with "Exact next work", step 1. Commit each small passing chunk on its own (one module, feature step, test set or doc update). Never push.

## Last passing commit

- Last code commit: `e266183 Add mapping confirmation screen` (newer commits are docs only). Verified there on the original Windows machine: `npx tsc --noEmit` PASS; `npx vitest run` 12 files/110 tests PASS; `npm run build` PASS; `node scripts/browser-check.mjs` (after build) 12/12 PASS.
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
| W6 remaining P0 (multi-gesture) | TESTING (session 3 coordinator owns `src/app/session.test.ts`, `src/app/session.ts`, `src/components/**`, `src/App.test.tsx`). R6 revision 2 APPROVED (r6_review → r6_rereview). Code partially done (below); W6 tests and independent testing review still needed. |
| W7a profiles/recalibration → W7b scoring/recommendations → W7c discovery | Authorized, not started. Each needs its own reasoning revision + independent review before code. |
| W8 hardening | Authorized, not started. Human checks stay pending. |

## W6 status (R6 revision 2)

Done and committed:
- `src/app/mapping.ts` (+7 tests): proposals for 1–4 gestures, validation (one select, distinct actions, previous needs next, max 4), `step` vs `auto` mode, descriptions.
- `src/app/session.ts` / `types.ts`: approved gesture SET + mapping replaces the single model; "Add a movement" (duplicates refused), held-out attempts plus one cross-check per existing gesture, negative window over the whole set; `mapping` → `mapping-confirm` (only Approve arms; Keep current first); Change controls; Use previous controls (practice; revalidated, needs approval); per-action routing (only the select gesture latches; next/previous move; pause toggles; unmapped events consumed and ignored); step mode has no timed advance; 60 s idle fail-safe switches to automatic scanning.
- UI: mapping/confirmation screens, step-mode hint, movement name shown during check attempts, decision targets rendered in the toolbar.
- Test helpers ready but NOT yet used: `Harness.stepTo`, `Harness.addMovement`, constants `MOUTH`, `PUCKER`, `CHEEK`, `HEAD_WOBBLE` in `src/app/session.test-support.ts`.

## Exact next work (ordered)

1. Write W6 session tests in `src/app/session.test.ts` (new `describe('multiple gestures')`): add a second gesture (MOUTH) via `addMovement`, assert cross-check evidence and negative window over both; candidate that disturbs the old gesture fails its cross-check and the old set/mapping stay active after fresh neutral; duplicate movement refused; simultaneous BROW+MOUTH selects nothing; Next/Select step mode: no timed advance, a next dwell spanning a scan boundary selects nothing, select picks the stepped item; previous with 3 gestures; pause gesture toggles and next is ignored while paused; one-gesture fallback ignores the unmapped gesture; Change controls needs confirm + fresh neutral, Keep current preserves mapping; Use previous controls; idle fallback after 60 s; 3- and 4-gesture mappings reach every control; assisted mode unaffected. Fix any bugs found. Commit tests and each fix separately.
2. Small UI follow-ups (commit separately): CameraPanel lists every approved movement with its action; ChooseView disables already-used movements while adding; EvidencePanel labels cross-checks; App test that renders mapping proposals with scan highlight.
3. Full checks (tsc, vitest, build, browser-check), then an independent testing-review subagent (give it the skill file, the four docs, role, R6 revision 2, files, checks). Fix blockers as small commits; record results in `reasoning.md` (R6 review table) and here; mark W6 "software verified; human acceptance pending" in `plan.md`.
4. W7a: write R7 (local profiles: opt-in Save, named profiles, Delete, version/schema validation, nonfinite rejection, disarmed restore → rest check → revalidation → mapping confirmation; saved phrases; never video/frames/messages) in `reasoning.md`, get independent review, then implement in small commits. Then W7b, W7c, W8 per `plan.md`.

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
- Coordinator: Claude Code (session 3). Commits: `f1291e7 Add bundled Chromium fallback`.
