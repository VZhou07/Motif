# Participant requests — handoff

- Owner: Agent 1 (communication teammate; Claude Code coordinator). Branch `feature/participant-requests`, worktree `<main checkout>/.cache/worktrees/participant-requests` (gitignored folder of the main checkout). Upstream tracking removed; never push (the user pushes).
- Base: started at `22aa5b4`; merged `origin/feature/request-relay` `1e94ede` in `6548d28`. Outside the two owned folders the tree is identical to `1e94ede`.
- Design: P1 revision 3 APPROVED by p1_review. Implementation notes and both testing-review rounds are recorded in `reasoning.md`.
- State: **reached (feature-ready, software verified)** — independent p1_testing PASS at `0d2e912` after a BLOCKING round at `5ce73dd`. NOT integrated: Agent 3 wires it (see `integration.md`). Human/hosted acceptance pending.
- Owned files: `src/features/participant-requests/**`, `docs/workstreams/participant-requests/**`. No shared file edited.

## Commits

`fbb9185` Plan participant requests · `7446802` Add request test backend · `59fb184` Add request backend faults · `76dde32` Add participant request controller · `17dd19b` Test participant request controller · `dd28def` Test request gesture access · `79c9005` Add participant request panel · `a650be6` Add participant pairing view · `8119857` Export participant request feature · `bd130ab` Test participant request screens · `3f535af` Document request integration hook · `5ce73dd` Record participant request checks · `1b98b55` Fix revoked device re-pairing · `a920b32` Test re-pairing and late results · `6548d28` merge of `origin/feature/request-relay` · `0d2e912` Allow time for database tests · this docs commit.

## Files

- `controller.ts`, `ParticipantRequestsPanel.tsx`, `ParticipantPairing.tsx`, `participant-requests.css`, `index.ts` — the feature.
- `requests.test-support.ts` — real `CareService` over Agent 3's PGlite SQL/RLS harness with fault switches. Tests only.
- Tests (44): `test-support.test.ts` 3, `controller.test.ts` 28, `gesture.test.ts` 4, `components.test.tsx` 9.

## Checks at `0d2e912`

- `npx tsc --noEmit` PASS; `npm run build` PASS (coordinator and tester).
- `npx vitest run`: 47 files / 608 tests, 601 pass, 7 fail — all upstream (`session.conflicts.test.ts` 4, `CalibrationPreparation.test.tsx` 3, "could not select comfortable in stage comfort"), identical at `1e94ede`. All 44 feature tests pass in the full run.
- Browser check not run: nothing mounts the feature yet.

## Next

1. User pushes `feature/participant-requests` and opens a PR into `feature/request-relay`.
2. Agent 3: fix the 7 upstream failures; wire the feature per `integration.md` and run its real-session acceptance tests.
3. Human/hosted: Supabase project, two devices, real camera, Space switch, screen reader.
