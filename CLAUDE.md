@AGENTS.md
@.agents/skills/motif-checkpoint/SKILL.md

# Claude Code entry point

The shared project rules live in [AGENTS.md](AGENTS.md). Read [plan.md](plan.md), [reasoning.md](reasoning.md), and [progress.md](progress.md) before acting. Keep product decisions, independent reviews, test evidence, and handoffs in those files rather than creating a second set of rules here.

Delegate reasoning review before implementation and independent test review after each feature. Explicitly tell every delegated agent to read the shared project documents; do not assume conversation history or instruction imports were inherited. Use the main coordinator to chain reviews and implementation if a worker cannot delegate.

The imported checkpoint skill is the canonical procedure. Every checkpoint subagent must explicitly read `.agents/skills/motif-checkpoint/SKILL.md` and the assigned project documents. `.claude/skills/motif-checkpoint/SKILL.md` makes that same procedure discoverable as a Claude skill without duplicating it.

Follow the approved sustained-build scope and separate software verification from pending human acceptance as described in `AGENTS.md` and `plan.md`. Do not stop after the first slice or reopen approved product decisions. Runtime continuation depends on the capabilities of the current client; use its supported mechanism without claiming unavailable Goal features.

The build has now been requested. The user is sleeping and the camera is covered: reason through problems without asking them questions, keep real-person checks pending, and continue useful authorized work. Keep `STATUS.md` short and easy to understand; use `progress.md` for exact restart instructions if runtime or credits interrupt the work.

For autonomous approved implementation, use Claude Code Auto mode when available; otherwise use Accept edits with narrowly approved test/build commands. Plan mode is for review, not implementation. Actual tool availability and permissions come from Claude Code and organization policy, not this file. See the tool guidance in `AGENTS.md`.

Never push. Local checkpoint commits during the approved build are authorized after automated checks and independent review, using the existing author identity. Commit subjects must be brief and descriptive, with no body, trailers, or coauthor attribution. If no identity is configured, leave changes uncommitted and record it.
