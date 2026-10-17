# Working on Motif

Read [plan.md](plan.md), [reasoning.md](reasoning.md), and [progress.md](progress.md) before changing the project. `plan.md` is the product idea, scope, decision register, and checkpoint contract. Follow the user's latest instructions when they change that scope.

## Overnight work and simple updates

- The user said `build`: the approved Goal is active. The user is sleeping; do not ask them questions to resolve ordinary uncertainty. Reason through problems with subagents, use conservative reversible decisions within the approved scope, record blockers, and continue other useful work. Permissions and excluded scope still apply; do not bypass a denied action.
- The laptop camera is covered. Do not ask to uncover it, access it for unattended human tests, or claim live-camera/comfort/speech-audibility acceptance. Test numeric streams, adapter failures, and browser behavior automatically; leave real-person checks pending.
- Keep [STATUS.md](STATUS.md) brief and in plain language: what works, what is being built next, and what remains untested. Update it at meaningful milestones, replace stale text, and keep it under about 200 words. Keep exact commands, owners, failures, and resume steps in `progress.md`, not a long user-facing log.
- User instruction (repeated 2026-10-17): keep building without stopping; if stuck, reason it through (use subagents) instead of asking. Update `STATUS.md` as you go in brief, plain, low-jargon words. When credits run out, the user starts a new agent or resumes this one later, so keep `progress.md` ready for an immediate pickup at every step. Work in small steps so no single response runs too long.
- Continue through the approved scope until software acceptance is complete or runtime/credits prevent more work. Before any handoff, record the last passing commit, uncommitted work, active file owners/processes, unresolved tests, and the next concrete action so another agent or this resumed session can pick up without repeating finished work. Do not mark the goal complete merely because credits are low.

`CLAUDE.md` imports this file so Claude Code and Codex share the same rules. Use the canonical uppercase filenames `AGENTS.md` and `CLAUDE.md` for discovery across operating systems; the other project documents use lowercase names.

## Required checkpoint skill

Before implementing, reviewing, testing, or resuming a checkpoint, every coordinator and subagent must explicitly read the entire [motif-checkpoint skill](.agents/skills/motif-checkpoint/SKILL.md). Discovery of the skill's name/description does not mean its body was read. Read it directly when the client has not loaded it; follow only the role and scope assigned to you.

The canonical procedure is `.agents/skills/motif-checkpoint/SKILL.md`; `.claude/skills/motif-checkpoint/SKILL.md` is a discovery adapter that points to it. `CLAUDE.md` also imports the canonical file at startup. Keep the procedure in one place.

Every delegation must provide the canonical skill path, `AGENTS.md`, `plan.md`, `reasoning.md`, `progress.md`, the assigned role, checkpoint, current reasoning revision, owned files, acceptance checks, and expected report. Require the receiving agent to read them; never assume inherited conversation context or automatic imports. Reviewers/testers return findings to the coordinator and do not recursively start another full review chain. An agent unable to load a required file reports that gap instead of claiming compliance.

## Plan and review before implementation

1. Use the approved product decisions in `plan.md`. The user approved UA1–UA3 for full P0 plus ordered P1, product defaults, and local checkpoint commits. Do not ask the sleeping user further questions. Resolve engineering uncertainty with independent reasoning; record any genuinely out-of-scope decision and continue authorized independent work without expanding scope.
2. Work on one runnable checkpoint at a time. Before writing its implementation, describe the design, typed contracts, assumptions, failure modes, and test cases in `reasoning.md` and record the intended work in `progress.md`.
3. Spin up an independent subagent to read those documents and validate the reasoning BEFORE implementation. The reviewer must check requirements, alternatives, accessibility, timing, privacy, and safety as applicable. Resolve every blocking finding; record the reviewer, reviewed revision, findings, fixes, and explicit verdict. A plan is ready only when the reviewer finds no unresolved implementation blockers. If subagents are unavailable, report that limit instead of pretending a review happened.
4. Substantive design changes invalidate the affected review. Update the reasoning and get another independent review before implementing the changed design. Parallel implementation is allowed only for reviewed work with clear file ownership.
5. Implement the smallest working feature. Use real camera inference in the application; synthetic streams belong in tests only. Keep the app runnable between milestones.
6. After each feature or substantial feature, run its meaningful unit tests and relevant integration tests with Vitest. Run TypeScript checking and a production build at integration checkpoints. Then have an independent subagent inspect the implementation, check whether the tests actually challenge its failure modes, and run the relevant checks itself. The implementer reporting green is not the testing review. Resolve every blocking finding and rerun affected checks before advancing dependent work.
7. Record software verification and human/hardware acceptance separately. Mark a checkpoint reached in BOTH `plan.md` and `progress.md` only after all its required criteria pass. If automated dependencies pass but required manual evidence is unavailable, record `software verified; human acceptance pending`, leave the overall checkpoint unchecked, and continue later independent authorized software work. An observed failure blocks affected dependencies; pending status cannot bypass failed tests. Never claim an unobserved webcam demo, accessibility result, or reliability measurement.

## Approved sustained build

- The user approved the unattended contract in `plan.md` (UA1–UA3). The next explicit `build` instruction requests a persistent Goal for full P0, then P1 in this order: local profiles/recalibration, observed reliability/mapping recommendations, verified free discovery, then final hardening. Start that goal when asked to build; readiness discussion alone does not start it. P2 remains excluded.
- Continue through reviewed checkpoints until the approved software scope and applicable automated checks/reviews are complete. Do not stop after the first slice, a single feature, or a normal progress update, and do not request renewed product approval at W6/W7. Preserve required independent technical reviews.
- Human webcam, comfort, speech-audibility, and limited-input acceptance may remain explicitly pending at software handoff. Complete all other useful approved work rather than waiting for the sleeping user or pretending these checks passed.
- Choose and record routine implementation details autonomously. Install compatible development dependencies and obtain the official model/browser-test assets using existing native approval controls; keep caches scoped to the workspace or permitted temporary directories. Do not change global npm/client/security/power settings or start paid/external services.
- Keep the current client, workspace, and computer available for local execution. Respect permission decisions and runtime limits; record true blockers, preserve the last passing state, and continue useful independent work where possible. Markdown instructions cannot guarantee uninterrupted runtime or zero defects.

## Handoff and agent failure

### Concurrent caregiver workstreams

For the selected four-branch caregiver build, use [docs/caregiver-demo-plan.md](docs/caregiver-demo-plan.md) and [docs/agent-prompts.md](docs/agent-prompts.md). Each teammate works in a separate clone/worktree. The backend/integration owner alone edits shared contracts, root planning/status documents, app routing/session integration, global privacy/network policy, profile schema and dependency manifests/lockfiles.

Feature owners still read the root plan/reasoning/progress and canonical skill, but record their own designs, independent review verdicts, progress, tests and resume instructions in `docs/workstreams/<workstream>/reasoning.md` and `progress.md`. These per-feature documents satisfy the reasoning/handoff-writing requirement for that worker; the integrator summarizes them in root documents. Use `participant-requests`, `caregiver-dashboard`, `request-relay` or `browser-access` as the workstream directory. Do not have four agents edit the root journals. Existing communication files transfer only to the communication teammate or after an explicit owner handoff.

Commit shared versioned contracts on an agreed passing base before dependent implementation. Other workers may inspect/design while that gate is pending; do not invent incompatible contracts. Report the base/contract commit IDs so the human teammates can share them; never push automatically. Integrate feature commits on the integration owner's isolated branch after independent review/checks, preserving active checkouts. Do not merge over a teammate's ongoing work. A missing subagent tool or unavailable hardware check must be recorded honestly.

- Treat `progress.md` as the durable handoff record. Update it before each implementation chunk, after every review/checkpoint, and before stopping or handing off. Keep the current reasoning revision and exact next action visible.
- Every active work item must name its owner/subagent, allowed files, dependencies, acceptance tests, and state (`planned`, `reviewing`, `implementing`, `testing`, `blocked`, or `reached`). Give parallel workers disjoint file ownership; transfer ownership explicitly before another agent edits those files.
- Record the last passing checkpoint, Git base commit, changed/new files and their purpose, completed versus partial behavior, exact commands/results, known failures, pending manual checks, relevant running command/session identifiers, and a small ordered resume checklist. Never store credentials, private recordings, or environment secrets in handoff files.
- If an agent fails or disappears, the replacement first reads all four project documents, inspects `git status` and the actual diff, reconciles partial edits with the handoff, and checks whether related processes are still running. Preserve unfinished and unrelated work. Do not blindly restart the task or assume an old review covers changed code.
- Reassign the failed worker's bounded task, update ownership/status, and resume the first actionable unmet criterion under the approved software/human gate distinction. Preserve unavailable manual checks as pending while independent software work continues. Obtain a fresh reasoning review when recovery changes the design; obtain independent test review before completion.
- If checks fail, mark the affected work incomplete and repair it before advancing. Keep the last passing checkpoint/evidence visible. Do not paper over failures, replace real recognition with mocks, weaken tests to obtain green, or claim zero bugs because agents reviewed the code.

## Agent support and operating modes

Verified against official documentation on 2026-10-17; installed client versions and managed policy can differ. This file requests delegation; it cannot grant tools or permissions. At session start check that a real subagent tool exists, and explicitly include the four project-document paths and bounded task in every delegation. If unavailable, report the limitation and leave mandatory independent review pending.

| Tool | Recommended mode for approved implementation | Delegation / review guidance |
| --- | --- | --- |
| Codex | Default/implementation mode with workspace writes and **Approve for me** where available (automatic sandbox-boundary review). Keep existing managed limits. | Current releases support subagents; this session has working spawn/message tools, already exercised. Choose review-only tasks for reasoning reviewers and implementation tasks for workers. Subagents inherit parent permissions; a read-only instruction is not a separate sandbox. |
| Claude Code | **Auto** when available; otherwise **Accept edits** (`acceptEdits`) with specific test/build commands approved. | Keep the **Agent** tool available to the coordinator. Use `/agents` to inspect available agents. The main coordinator can run reviewer → implementer → tester sequentially; nested delegation depends on version, depth limits, and Agent access. |
| Other coding clients | A write-capable implementation mode after product approval. | Verify that client actually exposes delegation. Loading these Markdown files does not add subagent support. Do not invent reviewers or claim sequential self-review was independent. |

Use Plan/read-only mode for analysis-only sessions; switch to a write-capable mode for implementation and command execution. Permission automation and reasoning effort are different settings. Retain the user's selected model; use stronger reasoning for safety reviews if supported and explicitly configured, without silently changing models. Do not enable Full Access, permission bypass, or globally change settings to make routine development autonomous. The user's pre-build product approval and no-push rule still apply in automated modes.

Official references: [Codex subagents](https://developers.openai.com/codex/subagents/), [Codex automatic approval review](https://learn.chatgpt.com/docs/sandboxing/auto-review), [Claude Code subagents](https://code.claude.com/docs/en/sub-agents), [Claude Code permission modes](https://code.claude.com/docs/en/permissions), and [Claude instruction imports](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools).

## Architecture and behavior

- Keep Face Tracker, Feature Processor, Discovery, Calibration, Recognition, Control Mapper, Input State Machine, Accessible UI, and Profile Storage independent through typed contracts. Implement modules when their checkpoint needs them; avoid speculative infrastructure.
- No movement is mandatory for all users. Learn thresholds from each person's baseline and repeated comfortable movements. Free exploration yields candidates, not proof of intent.
- Use time-based filtering, separate activation/release thresholds, minimum dwell, one action per hold, and neutral rearming. Invalid, missing, stale, ambiguous, or interrupted tracking must produce no action. Require fresh neutral after recovery or phase changes.
- Never use model confidence as evidence of intention. Fit only on training attempts; evaluate separately on held-out attempts and negative activity. Present small-sample observations honestly.
- Every mapping needs explicit user approval. After calibration, navigation, speech, Pause, Resume, and access to recalibration must remain operable using the available gesture(s). Support assisted setup without promising fully independent onboarding prematurely.
- Process camera input locally. Do not upload/persist frames, raw video, or facial identity data. Store only approved minimal calibration profiles when the profile checkpoint is implemented. No backend, medical diagnosis, or emergency detection in this MVP.

## Git rules

- Local commits during the approved build are explicitly authorized after meaningful chunks pass required automated checks and independent review. Use the existing Git author identity; if absent, leave work uncommitted, record the reason, and continue useful work. Do not invent an identity. Keep each commit message to ONE short, descriptive subject of a few words: `Fix gesture rearming`, `Add baseline calibration`, `Refactor feature processor`, or `Update game state`.
- User instruction (2026-10-17): commit MORE OFTEN in SMALLER, focused chunks (one module, refactor, feature step, test set, or doc update per commit), not one large checkpoint commit. Commit each small chunk as soon as its relevant tests and typecheck pass; independent reviews still gate marking a checkpoint reached, and review fixes land as further small commits.
- User instruction (2026-10-17, later): the earlier single large commit `Add guided calibration app` was undone at the user's request and rebuilt as a series of small verified commits with an identical final tree. Never bundle a whole checkpoint into one commit again. That was a one-time, user-requested rewrite of unpushed local history; otherwise the no-rewrite/no-amend rule below still applies.
- No commit body, submessage, trailers, signatures, or `Co-authored-by` attribution to the agent. Do not add agent attribution in code or documentation.
- NEVER push. The user will push. Do not publish, deploy, open a PR, rewrite history, or amend existing commits unless separately requested.
- Preserve unrelated user changes. Do not change global Git configuration.
