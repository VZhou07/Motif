# Four teammate prompts

Use the selected [caregiver demo plan](caregiver-demo-plan.md). These are implementation handoffs for the user's teammates, not evidence that any feature is already built.

Start Agent 3 first to prepare the passing base and reviewed version 1 contracts. Agents 1, 2 and 4 may inspect/design concurrently; dependent implementation starts when the human team shares that contract commit. Each agent uses a separate clone/worktree. These planning files currently live on fix/gesture-conflicts; share the selected planning/rules commits before using the prompts. Preserve the active original checkout and communication teammate's work. Humans handle pushing/sharing commits.

## Agent 1 — participant requests

You own Motif's participant request interface on feature/participant-requests, checkpoints C2/C3. You are the communication teammate; do not take over another teammate's active files without a handoff.

Read AGENTS.md, plan.md, reasoning.md, progress.md, .agents/skills/motif-checkpoint/SKILL.md and docs/caregiver-demo-plan.md. Use your own clone/worktree from Agent 3's agreed passing base/contracts. Inspect/design while contracts are pending; do not invent a competing API.

Own src/features/participant-requests/** and docs/workstreams/participant-requests/{reasoning,progress}.md. Agent 3 alone integrates shared session/types/routes, network policy, root journals and package/lockfile changes. Coordinate communication-view changes with its existing owner.

Build gesture-operable requests: Water, Bathroom assistance, Help changing position and General help. Show Pending/Failed, Sent, Acknowledged, Completed and Cancelled truthfully; allow cancellation. A deliberately selected request sends once. Composing/speaking ordinary text never sends it remotely. Existing local communication, separate approved gesture actions and assisted Space input must keep working. Use the actual shared request client. Fixtures belong only in tests. Never transmit camera/calibration/gesture streams/message drafts; route requests through approved selectable targets, not a parallel global gesture listener.

Before code, write your workstream design and get independent subagent reasoning approval. After meaningful features, run relevant tests and have an independent testing subagent inspect and execute checks. Cover long-hold duplicate prevention, disconnected/failed send, retry with the same request ID, correct-person acknowledgment, cancel races and gesture/Space reachability. Run typecheck/build before integration readiness; keep unavailable real-device checks pending.

Commit small verified chunks: short subject only, no body/coauthor/signature; never push or touch other worktrees. Keep resumable progress with owners, commit IDs, exact tests/results, failures and next step. Report the integration hook Agent 3 needs. Do not deploy or create external accounts.

## Agent 2 — caregiver dashboard

You own Motif's caregiver dashboard on feature/caregiver-dashboard, checkpoints C2/C3.

Read AGENTS.md, plan.md, reasoning.md, progress.md, .agents/skills/motif-checkpoint/SKILL.md and docs/caregiver-demo-plan.md. Use your own clone/worktree from Agent 3's agreed passing base/contracts. Inspect/design while contracts are pending; do not invent your own schema/backend.

Own src/features/caregiver/**, feature-scoped styles/tests and docs/workstreams/caregiver-dashboard/{reasoning,progress}.md. Export a screen for Agent 3 to mount. Agent 3 alone edits shared session/types/routes, network policy, root journals and package/lockfile files.

Build a dashboard for one caregiver and multiple explicitly paired people. Show aliases, outstanding requests, request age and authoritative status. Provide explicit Acknowledge/Complete, visible connection/stale state, and sound only after Enable sound. The dashboard remains open during the demo; do not promise background/locked-phone alerts. A displayed card is not human acknowledgment. Use the shared real client and backend-authorized group membership. Render text safely; identify requests by ID/revision, not alias or array position. No camera views, medical records or fabricated events.

Write your workstream design and obtain independent reasoning approval before code. Test two people with similar aliases, correct request updates, replay/duplicate events, stale revisions, reconnect refresh, revoked pairing, disconnected behavior, sound deduplication and keyboard access. Test fixtures never become the final delivery path. Obtain an independent tester who executes checks; run relevant tests/typecheck/build before readiness.

Commit small passing chunks with short subject only, no body/coauthor/signature; never push, deploy, create external accounts or edit another worktree. Maintain resumable progress with last passing commit, partial work, exact checks and next step. Report commit IDs and routing hook; claim cross-device delivery only when observed.

## Agent 3 — backend, contracts and integration

You own Motif's backend, shared contracts and integration on feature/request-relay, coordinating C1–C6. Start first; other teammates own participant UI, caregiver UI and browser access.

Read AGENTS.md, plan.md, reasoning.md, progress.md, .agents/skills/motif-checkpoint/SKILL.md and docs/caregiver-demo-plan.md. Inspect Git status, branches, fixes and active ownership. Use an isolated integration worktree. Preserve the original checkout, Grok's edits and the communication teammate's work. Reconcile committed wink/conflict fixes on your branch with review/regression checks; never copy or commit another worker's unfinished changes without handoff.

Own server/**, shared request/command contracts/client, docs/workstreams/request-relay/**, root coordination docs, shared session/types/routes, dependency manifests/lockfiles, profile integration and network policy. Do not overwrite others' feature folders.

FIRST: write/review the bounded backend/contract design with an independent subagent. Commit version 1 request/client/browser-command contracts on a passing base and report exact base/contract commit IDs for humans to share. Others consume these exports. Resolve routine engineering choices without reopening approved product scope. Do not create external accounts, paid services or deployments; prepare locally and record any provisioning dependency.

Implement real two-device delivery, scoped caregiver/participant pairing, server-authorized identity, durable acceptance, explicit acknowledgment/completion/cancellation, session-limited retention and revocation. Pending/Failed are local; Sent requires server receipt; Acknowledged requires caregiver action. Use stable request IDs, idempotent retries, authoritative revisions and reconnect refresh. Only deliberate request/pairing/auth traffic may leave the device. Camera/calibration/browsing data stays local; MediaPipe telemetry remains blocked. Update outdated local-only privacy wording/tests. Prefer same-origin HTTPS; any other API origin must be exact and reviewed. Never bundle server/admin secrets into clients.

Independently review reasoning before code and independently execute testing after meaningful features. Test unauthorized access, group isolation, impersonation, expired/revoked pairing, duplicate retries, invalid transitions, cancellation races, reconnect and retention. Integrate one Water request and acknowledgment early. Integrate reviewed feature commits incrementally on your branch after owner handoff; never merge over an active teammate checkout.

Run full tests/typecheck/build and applicable browser/network checks. Separate automated clients from actual two-device/camera acceptance. Keep root/workstream handoff current: owners, base/contract/feature commits, processes, failures and next steps. Make small local commits with short subject only, no body/coauthor/signature; never push. Finish with integration evidence and pending human checks.

## Agent 4 — browser access

You own Motif's limited Chrome companion on feature/browser-access, checkpoint C4 and its C5 integration evidence.

Read AGENTS.md, plan.md, reasoning.md, progress.md, .agents/skills/motif-checkpoint/SKILL.md and docs/caregiver-demo-plan.md. Use a separate clone/worktree from Agent 3's agreed passing base/contracts. Own extensions/motif/**, src/features/browser-access/** and docs/workstreams/browser-access/{reasoning,progress}.md. Agent 3 owns shared contracts, existing recognition/session integration, routing/profiles, root docs and package/lockfile changes.

FIRST prove one approved real gesture scrolls a supported webpage, returns to communication and leaves request sending reachable. Prototype a persistent Chrome side panel with ONE visible camera/runtime, locally packaged MediaPipe/model/WASM and helper-assisted opening/permissions. Reuse recognition; do not fork it or start a second tracker. Coordinate embedding participant UI with its owner/Agent 3.

Motif intentionally stops tracking when hidden. Preserve that rule. Do not put a tracker in a service worker, assume camera inference grants Chrome user activation, or promise a gesture can reopen a closed controller. Verify actual camera/model loading and visibility across tabs before expanding. Obtain reviewed host permissions for explicit supported ordinary pages; explain unsupported/restricted pages.

If the side panel cannot pass, use the planned visible docked-Motif window and extension bridge. If that also fails, document evidence and deliver the scoped in-app reader fallback; do not claim OS-wide control. Commands: Scroll up/down, Back, Return to communication. Each approved gesture resolves to ONE active-scope command. Show mappings, preserve Pause/neutral rearming, cancel on tracking/permission loss or stale session, and never replay failed commands late. One event cannot both scroll and send a request.

Write workstream reasoning and get independent subagent approval before code. Independently test command scope, allowed origins, sender identity, duplicate/stale events, tab changes, tracking loss, closed/hidden controller and Return reachability. Synthetic camera/streams are tests only; do not open the covered real webcam or claim human acceptance. Obtain an independent tester who executes checks; run relevant tests/typecheck/build and coordinate dependencies with Agent 3.

Commit small verified chunks: short subject only, no body/coauthor/signature; never push, deploy, create external accounts or modify other worktrees. Maintain resumable progress and report proven architecture, permissions, commit IDs, exact checks, limitations and integration hook.
