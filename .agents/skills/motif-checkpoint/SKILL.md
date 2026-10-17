---
name: motif-checkpoint
description: Implement, review, verify, or resume a Motif project checkpoint using independent reasoning and testing gates with durable handoff. Use for Motif checkpoint work and recovery, not unrelated questions.
---

# Motif checkpoint workflow

## Read before acting

Read the repository's [AGENTS.md](../../../AGENTS.md), [plan.md](../../../plan.md), [reasoning.md](../../../reasoning.md), and [progress.md](../../../progress.md). Those documents own project rules, scope, decisions, and status; this skill supplies the procedure. Resolve these paths relative to this skill directory.

Use the latest user authorization and the role assigned by the coordinator. Skill setup, invocation, or a reviewer verdict does not approve unresolved product decisions. If asked a question, answer it without starting an implementation checkpoint.

## Follow the assigned role

- **Coordinator:** choose the next authorized, unfinished checkpoint and run the sequence below. Own shared status updates unless file ownership is explicitly delegated.
- **Reasoning reviewer:** independently inspect the current reasoning revision against the plan, assigned acceptance criteria, and relevant existing artifacts. Report blocking findings or explicit approval with the reviewed revision. Do not implement, mark the checkpoint reached, or recursively demand another review of your review.
- **Implementer:** read the approved reasoning and work only in assigned files. Report changes, actual checks, failures, and remaining acceptance criteria to the coordinator. A substantive design change returns to reasoning review before implementation.
- **Testing reviewer:** independently inspect the implementation and test coverage, run relevant checks yourself, and report commands, outcomes, omissions, and blocking findings. Do not accept an implementer's claimed passing result as your execution evidence. Do not change code unless reassigned to implement a fix.

Every delegation must explicitly name this canonical skill, the four project documents, role, checkpoint, reasoning revision, owned files, expected result, and acceptance checks. Do not assume subagents inherited instructions. Use available delegation tools; if a worker cannot delegate, the coordinator chains the roles. If no independent subagent can run, record the missing review and leave that gate incomplete.

## Coordinator sequence

1. **Reconcile and claim:** inspect Git status, relevant tracked and untracked edits, and any recorded running commands. Reconcile actual files with the handoff; preserve unrelated and partial work. Record owner, file boundaries, current state, and first unmet acceptance criterion in progress.md before editing.
2. **Check scope:** use the approved decisions and sustained-build contract in plan.md or the latest user instruction. Do not reopen approved product choices or routine engineering decisions. The later explicit build instruction starts the authorized scope; readiness discussion alone does not. Ask only about a genuinely new blocking decision outside that scope, while continuing independent authorized work.
3. **Review reasoning:** write or update the design, contracts, failure modes, and acceptance checks in reasoning.md. Have an independent reviewer validate that revision BEFORE implementation; resolve every blocker and record the explicit verdict. A prior review does not cover substantive changes.
4. **Implement one bounded chunk:** assign disjoint files when parallelizing. Keep the checkpoint runnable. After each feature run the relevant meaningful checks; fix failures before advancing. Commit each small passing chunk separately (never one large checkpoint commit) and follow AGENTS.md for real inference, privacy, accessibility, and Git constraints.
5. **Verify independently:** assign a separate testing reviewer to inspect and execute the relevant checks. Application features require meaningful unit/integration coverage; integration checkpoints also require typecheck and production build. Documentation/skill-only changes use applicable frontmatter, path/import, and consistency checks instead. Record unavailable checks honestly.
6. **Resolve and advance:** address blocking findings and rerun affected checks. Record software verification and human/hardware acceptance separately. Mark the checkpoint reached in BOTH plan.md and progress.md only when all required criteria pass. If software dependencies pass but manual evidence is unavailable, leave the overall checkbox open, record software verified/human acceptance pending, and continue subsequent independent authorized software work. An observed failure blocks affected dependencies; pending status cannot bypass failing tests. Continue through the approved objective rather than stopping after the first slice or one checkpoint.
7. **Leave a handoff:** update the durable fields in progress.md with the last passing state, partial edits, exact commands/results, active owners/processes, known failures, pending decisions/manual checks, and ordered next actions. Leave no secrets in these records.

## Recovery

When replacing a failed or interrupted worker, read the documents and this procedure again, inspect the actual Git diff and untracked files, check recorded process state, and explicitly transfer the bounded task's file ownership. Resume from the first actionable unmet criterion using the approved software/human gate distinction; preserve unavailable manual criteria as pending. Re-review changed reasoning and independently test finished work; never invent missing evidence or bypass a failed gate.
