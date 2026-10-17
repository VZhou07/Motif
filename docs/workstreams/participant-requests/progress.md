# Participant requests — handoff

- Owner: Agent 1 (communication teammate; Claude Code coordinator). Branch `feature/participant-requests`, worktree `<main checkout>/.cache/worktrees/participant-requests` (gitignored folder of the main checkout). Upstream tracking removed; never push.
- Base: tip of `origin/feature/request-relay` `22aa5b4` (source identical to Agent 3's verified base `2055e1c`; matches SparklingWater's pointer to `feature/request-relay`).
- Setup: `npm ci` (133 packages); model/WASM copied from the main checkout's ignored `public/`; `npm run check:assets` PASS. Baseline: tsc PASS; vitest 40 files / 496 PASS.
- Design: P1 revision 3 APPROVED by p1_review (rev1 BLOCKING B1–B4, rev2 BLOCKING B5–B6, rev3 APPROVED). Routine implementation notes recorded at the end of `reasoning.md`.
- State: **testing** — feature-ready, awaiting independent testing review. NOT integrated (Agent 3 wires it; see `integration.md`).
- Owned files: `src/features/participant-requests/**`, `docs/workstreams/participant-requests/**`. No shared file was edited (`git diff 22aa5b4 --stat -- . ':!src/features/participant-requests' ':!docs/workstreams/participant-requests'` is empty).

## Commits (oldest first)

`fbb9185` Plan participant requests · `7446802` Add request test backend · `59fb184` Add request backend faults · `76dde32` Add participant request controller · `17dd19b` Test participant request controller · `dd28def` Test request gesture access · `79c9005` Add participant request panel · `a650be6` Add participant pairing view · `8119857` Export participant request feature · `bd130ab` Test participant request screens · `3f535af` Document request integration hook.

## Files

- `controller.ts` — `ParticipantRequestController`: local Pending/Failed, server statuses, identity scoping, stable targets, bound cancel subject, announcements.
- `ParticipantRequestsPanel.tsx`, `ParticipantPairing.tsx`, `participant-requests.css`, `index.ts` — screens and exports.
- `test-support.ts` — real `CareService` over Agent 3's PGlite SQL/RLS harness with fault switches (offline, failRpc, failListAfterSend, hold gate, token refresh, adopt credential, caregiver sign-in). Tests only.
- Tests: `test-support.test.ts` (3), `controller.test.ts` (24), `gesture.test.ts` (4, real GestureRuntime + ScanController; feature-level), `components.test.tsx` (8, jsdom with a stand-in client).

## Checks at `3f535af` (coordinator)

- `npx tsc --noEmit` PASS.
- `npx vitest run` 44 files / 535 tests PASS.
- `npm run build` PASS (asset check, typecheck, Vite build).
- Browser check not run: no participant screen is mounted yet (Agent 3 integration).

## Pending

- Independent testing review (next).
- Agent 3: real-session wiring and the acceptance tests listed in `integration.md`.
- Human/hosted: Supabase project, two devices, real camera, Space switch, screen reader.

## Resume

1. Read AGENTS.md, plan.md, reasoning.md, progress.md, `.agents/skills/motif-checkpoint/SKILL.md`, `docs/caregiver-demo-plan.md` and this folder.
2. In the worktree: `git status`, `git log --oneline -12`; rerun tsc, full vitest, build.
3. Continue with the first pending item above.
