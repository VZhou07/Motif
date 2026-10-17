# Four teammate prompts

Use the selected [caregiver demo plan](caregiver-demo-plan.md). These are implementation handoffs for the user's teammates, not evidence that any feature is already built.

Start Agent 3 first to prepare the passing base and reviewed version 1 contracts. Agents 1, 2 and 4 may inspect/design concurrently; dependent implementation starts when the human team shares that contract commit. Each agent uses a separate clone/worktree. Planning originated on `fix/gesture-conflicts`; the Supabase foundation is being built separately on `feature/request-relay`. Do not assume either is the reconciled passing base. Share the actual approved planning/contract commits before using the prompts. Preserve the active original checkout and communication teammate's work. Humans handle pushing/sharing commits.

Every prompt includes the selected plan's Accounts, pairing and access section and Integrated completion contract. Agent 3 must deliver a connected, independently verified app, not merely merge-conflict resolution. The shared auth/session and ownership contract is part of the first contract checkpoint. Frontend role selection does not authorize access. Every feature reports feature-ready versus integrated-verified honestly.

All four agents read [Supabase setup](supabase-setup.md). The user selected Supabase Free; R16 revision 2 approves its foundation, not another provider or Realtime. Existing exports are `CareClient`/`CareSnapshot` and versioned models in `src/care/contracts.ts`, `createSupabaseCareClient` in `src/care/client.ts`, and `parseCareConfig` in `src/care/config.ts`. Use one shared client per control surface, clear old identity/epoch state and await disposal before replacement. Configure the exact uppercase `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` separately in each uncommitted `.env.local`, restart/rebuild, and never use a service key. There is no GitHub connection requirement. Authorized snapshots poll every two seconds; do not enable Realtime publications/channels or invent competing contracts. Hosted verification and full application wiring remain pending.

## Agent 1 — participant requests

You own Motif's participant request interface on feature/participant-requests, checkpoints C2/C3. You are the communication teammate; do not take over another teammate's active files without a handoff.

Read AGENTS.md, plan.md, reasoning.md, progress.md, .agents/skills/motif-checkpoint/SKILL.md and docs/caregiver-demo-plan.md. Use your own clone/worktree from Agent 3's agreed passing base/contracts. Inspect/design while contracts are pending; do not invent a competing API.

Own src/features/participant-requests/** and docs/workstreams/participant-requests/{reasoning,progress}.md. Agent 3 alone integrates shared session/types/routes, network policy, root journals and package/lockfile changes. Coordinate communication-view changes with its existing owner.

Build gesture-operable requests: Water, Bathroom assistance, Help changing position and General help. Show Pending/Failed, Sent, Acknowledged, Completed and Cancelled truthfully; allow cancellation. A deliberately selected request sends once. Composing/speaking ordinary text never sends it remotely. Existing local communication, separate approved gesture actions and assisted Space input must keep working. Use the actual shared request client. Fixtures belong only in tests. Never transmit camera/calibration/gesture streams/message drafts; route requests through approved selectable targets, not a parallel global gesture listener.

Implement the participant pairing/setup view using Agent 3's shared auth client and scoped expiring invitation. Show who receives requests and the active participant identity. Only the paired participant's requests are available; never let a dropdown/URL/local role flag choose another sender. Clear old request state and queued sends on logout, revocation or identity switch. Local communication can remain available when networking is unpaired. Test denied access to other participants and removal of old-session events, then help Agent 3 verify the actual sign-in/pair/send/acknowledge loop.

Before code, write your workstream design and get independent subagent reasoning approval. After meaningful features, run relevant tests and have an independent testing subagent inspect and execute checks. Cover long-hold duplicate prevention, disconnected/failed send, retry with the same request ID, correct-person acknowledgment, cancel races and gesture/Space reachability. Run typecheck/build before integration readiness; keep unavailable real-device checks pending.

Commit small verified chunks: short subject only, no body/coauthor/signature; never push or touch other worktrees. Keep resumable progress with owners, commit IDs, exact tests/results, failures and next step. Report the integration hook Agent 3 needs. Do not deploy or create external accounts.

## Agent 2 — caregiver dashboard

You own Motif's caregiver dashboard on feature/caregiver-dashboard, checkpoints C2/C3.

Read AGENTS.md, plan.md, reasoning.md, progress.md, .agents/skills/motif-checkpoint/SKILL.md and docs/caregiver-demo-plan.md. Use your own clone/worktree from Agent 3's agreed passing base/contracts. Inspect/design while contracts are pending; do not invent your own schema/backend.

Own src/features/caregiver/**, feature-scoped styles/tests and docs/workstreams/caregiver-dashboard/{reasoning,progress}.md. Export a screen for Agent 3 to mount. Agent 3 alone edits shared session/types/routes, network policy, root journals and package/lockfile files.

Build a dashboard for one caregiver and multiple explicitly paired people. Show aliases, outstanding requests, request age and authoritative status. Provide explicit Acknowledge/Complete, visible connection/stale state, and sound only after Enable sound. The dashboard remains open during the demo; do not promise background/locked-phone alerts. A displayed card is not human acknowledgment. Use the shared real client and backend-authorized group membership. Render text safely; identify requests by ID/revision, not alias or array position. No camera views, medical records or fabricated events.

Build real caregiver sign-in/sign-out and own-group paired-person/invitation/revocation views against Agent 3's shared auth/access client. A Choose caregiver button is not authentication. Only authorized people and requests may arrive from the backend; UI filtering is not enforcement. Show the current account, clear/unsubscribe old data on account changes, handle expired sessions, and test that caregiver B cannot access caregiver A's people/requests. Make these screens part of Agent 3's real mounted account-to-request flow rather than isolated mock pages.

Write your workstream design and obtain independent reasoning approval before code. Test two people with similar aliases, correct request updates, replay/duplicate events, stale revisions, reconnect refresh, revoked pairing, disconnected behavior, sound deduplication and keyboard access. Test fixtures never become the final delivery path. Obtain an independent tester who executes checks; run relevant tests/typecheck/build before readiness.

Commit small passing chunks with short subject only, no body/coauthor/signature; never push, deploy, create external accounts or edit another worktree. Maintain resumable progress with last passing commit, partial work, exact checks and next step. Report commit IDs and routing hook; claim cross-device delivery only when observed.

## Agent 3 — backend, contracts and integration

You own Motif's backend, shared contracts and integration on feature/request-relay, coordinating C1–C6. Start first; other teammates own participant UI, caregiver UI and browser access.

Read AGENTS.md, plan.md, reasoning.md, progress.md, .agents/skills/motif-checkpoint/SKILL.md and docs/caregiver-demo-plan.md. Inspect Git status, branches, fixes and active ownership. Use an isolated integration worktree. Preserve the original checkout, Grok's edits and the communication teammate's work. Reconcile committed wink/conflict fixes on your branch with review/regression checks; never copy or commit another worker's unfinished changes without handoff.

Own server/**, shared request/command contracts/client, docs/workstreams/request-relay/**, root coordination docs, shared session/types/routes, dependency manifests/lockfiles, profile integration and network policy. Do not overwrite others' feature folders.

FIRST: write/review the bounded backend/contract design with an independent subagent. Commit version 1 request/client/browser-command contracts on a passing base and report exact base/contract commit IDs for humans to share. Others consume these exports. Resolve routine engineering choices without reopening approved product scope. Do not create external accounts, paid services or deployments; prepare locally and record any provisioning dependency.

Include actual caregiver authentication, participant device sessions, pairing operations and a common auth/access contract in that first checkpoint. Caregiver accounts own isolated groups; participant sessions are scoped to one paired identity. Pre-provisioned demo accounts are sufficient; public signup/password recovery is outside this slice and credentials must not be bundled into frontend code. Generate expiring invitations with atomic single use/rate limiting; enforce ownership on every API/subscription/live event. Reject role/body/URL identity overrides, cross-account reads/writes and impersonation. Revoke sessions/connections and discard old-session responses/queued work. Local app test accounts are allowed; external provider account creation remains excluded.

Implement real two-device delivery, scoped caregiver/participant pairing, server-authorized identity, durable acceptance, explicit acknowledgment/completion/cancellation, session-limited retention and revocation. Pending/Failed are local; Sent requires server receipt; Acknowledged requires caregiver action. Use stable request IDs, idempotent retries, authoritative revisions and reconnect refresh. Only deliberate request/pairing/auth traffic may leave the device. Camera/calibration/browsing data stays local; MediaPipe telemetry remains blocked. Update outdated local-only privacy wording/tests. Prefer same-origin HTTPS; any other API origin must be exact and reviewed. Never bundle server/admin secrets into clients.

Independently review reasoning before code and independently execute testing after meaningful features. Test unauthorized access, group isolation, impersonation, expired/revoked pairing, duplicate retries, invalid transitions, cancellation races, reconnect and retention. Integrate one Water request and acknowledgment early. Integrate reviewed feature commits incrementally on your branch after owner handoff; never merge over an active teammate checkout.

Run full tests/typecheck/build and applicable browser/network checks. Separate automated clients from actual two-device/camera acceptance. Keep root/workstream handoff current: owners, base/contract/feature commits, processes, failures and next steps. Make small local commits with short subject only, no body/coauthor/signature; never push. Finish with integration evidence and pending human checks.

You own functional completion after merging: mount real role-aware routes/views, connect actual auth/request clients/backend, configure permissions/networking and wire gesture/browser commands. Execute the selected plan's Integrated completion contract on the merged tree, including caregiver A/A1/A2 versus caregiver B/B1 isolation, logout/revocation, browser-return-to-correct-participant and request acknowledgment. Fix integration failures until automated acceptance passes. A clean merge or isolated green tests is not a finished app. Report required wiring incomplete until it works; keep unavailable human/hardware checks explicitly pending.

## Agent 4 — browser access

You own Motif's limited Chrome companion on feature/browser-access, checkpoint C4 and its C5 integration evidence.

Read AGENTS.md, plan.md, reasoning.md, progress.md, .agents/skills/motif-checkpoint/SKILL.md and docs/caregiver-demo-plan.md. Use a separate clone/worktree from Agent 3's agreed passing base/contracts. Own extensions/motif/**, src/features/browser-access/** and docs/workstreams/browser-access/{reasoning,progress}.md. Agent 3 owns shared contracts, existing recognition/session integration, routing/profiles, root docs and package/lockfile changes.

FIRST prove one approved real gesture scrolls a supported webpage, returns to communication and leaves request sending reachable. Prototype a persistent Chrome side panel with ONE visible camera/runtime, locally packaged MediaPipe/model/WASM and helper-assisted opening/permissions. Reuse recognition; do not fork it or start a second tracker. Coordinate embedding participant UI with its owner/Agent 3.

Motif intentionally stops tracking when hidden. Preserve that rule. Do not put a tracker in a service worker, assume camera inference grants Chrome user activation, or promise a gesture can reopen a closed controller. Verify actual camera/model loading and visibility across tabs before expanding. Obtain reviewed host permissions for explicit supported ordinary pages; explain unsupported/restricted pages.

If the side panel cannot pass, use the planned visible docked-Motif window and extension bridge. If that also fails, document evidence and deliver the scoped in-app reader fallback; do not claim OS-wide control. Commands: Scroll up/down, Back, Return to communication. Each approved gesture resolves to ONE active-scope command. Show mappings, preserve Pause/neutral rearming, cancel on tracking/permission loss or stale session, and never replay failed commands late. One event cannot both scroll and send a request.

Consume Agent 3's shared participant auth/session adapter; do not create a second login/identity system in the extension. Return must preserve the correct paired participant and request status. Invalidate pending commands and old responses on logout, expiry, revocation or identity change. A different camera user needs appropriate calibration/profile revalidation, not just a new account label. Never copy credentials/calibration across origins silently or pass credentials through ordinary webpage messages. Test that account A's commands/requests cannot run as account B, and verify the real authenticated browser-return-and-send loop with Agent 3.

Write workstream reasoning and get independent subagent approval before code. Independently test command scope, allowed origins, sender identity, duplicate/stale events, tab changes, tracking loss, closed/hidden controller and Return reachability. Synthetic camera/streams are tests only; do not open the covered real webcam or claim human acceptance. Obtain an independent tester who executes checks; run relevant tests/typecheck/build and coordinate dependencies with Agent 3.

Commit small verified chunks: short subject only, no body/coauthor/signature; never push, deploy, create external accounts or modify other worktrees. Maintain resumable progress and report proven architecture, permissions, commit IDs, exact checks, limitations and integration hook.
