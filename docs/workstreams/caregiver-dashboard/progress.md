# Caregiver dashboard handoff

Owner: this workstream (Agent 2). Branch `feature/caregiver-dashboard`, worktree `.cache/worktrees/caregiver-dashboard` (inside the main checkout's gitignored `.cache`), base `22aa5b4`. Never push; do not touch other worktrees or root journals.

State: **planned → reviewing.** Design in `reasoning.md` revision 1 awaits independent reasoning approval. No feature code yet. `npm ci` done in the worktree (no new dependencies needed).

Resume: read AGENTS.md, plan.md, root reasoning/progress, the motif-checkpoint skill, `docs/caregiver-demo-plan.md`, `docs/agent-prompts.md` (Agent 2), then this directory. `git status` here; last passing commit = base `22aa5b4` until the first feature commit.

Next: (1) get reasoning approval, (2) `model.ts` + tests, (3) `sound.ts` + tests, (4) `useDashboard.ts` + tests, (5) screen + css + tests, (6) real-`CareService` integration test, (7) independent testing review, (8) report commit IDs and the mount hook.
