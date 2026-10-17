# Common starting base — revision 1

State: revision1 independently APPROVED by mapping_investigation after reading this actual file, before merge/code. This is a separate bounded step after CDB1's automated foundation gate. Owner root on feature/request-relay only. Do not alter active main, its untracked test, any teammate worktree or the port-5187 preview.

## Reconcile committed main

After saving the independently tested foundation in small commits, merge the committed main tip (currently 5ea672b) into this isolated branch. Reinspect the tip/status first. Preserve main's wink/short-hold, assisted navigation, saved baseline and Last setup features, together with R15's co-motion handling, diagnostic cues and fail-closed ambiguous input. Resolve STATUS/progress/reasoning journal conflicts by preserving both histories and writing an accurate current entry. A textual merge is not evidence of correct behavior. No uncommitted files from main are included.

Main permits Continue to reuse recent verification evidence. R15 changes the recognition policy, so old check times must not authorize skipping checks under the new recognizer. Add optional positive-integer `policyVersion` to StoredChecks and export a current policy constant. Accept legacy absent markers and other structurally valid versions without deleting profiles. Gate the entire quick-reuse condition on equality to the current policy. Otherwise repeat baseline, all frozen-model movement checks and the negative interval; retain explicit approval and neutral arming. buildProfile copies a marker only when actually supplied, never upgrades legacy evidence. Only storedChecks after real current-runtime success stamps the current marker. Preserve one-hour reuse of matching evidence, old/future timestamp handling and failed-restore invalidation. Do not change the profile container/schema version or silently delete user settings.

Owned code for this reconciliation: src/app/profiles.ts and session.ts plus their profile tests; no communication layout changes. Required tests: absent/mismatched markers remain readable but cannot skip; legacy save cannot become current; successful new checks stamp current; matching current evidence retains Continue behavior; stale/future checks fail closed; no approval/actions before required checks pass. Run the merged full regression, typecheck, build and synthetic-camera browser checks with an independent tester. Real camera/comfort acceptance remains pending.

## Browser command contract

Freeze a small shared type-only version-1 port before Agent 4 implements its adapter. Own src/care/browser-contract.ts and export it through src/care/index.ts. Actions: scroll-up, scroll-down, back, return-to-communication. A command carries version, unique id, action, inputEpoch, accessEpoch, issuedAtMs and expiresAtMs. BrowserCommandPort.execute returns matching command id/version and executed/rejected status; invalidate cancels pending commands. Timestamps use the visible controller's monotonic clock, not wall time.

This type declaration grants no authority. Agent 4's reviewed implementation must bind each port to one explicitly supported tab/controller, check current approved input epoch and authorized access epoch, active browser scope, fresh valid tracking, command deadline, duplicate id and permissions before dispatch; recheck identity/scope on completion, never retry late or copy tokens through page messages. Return changes the controller to communication with fresh neutral. One input event resolves to one action. No tracker runs while hidden, no service-worker camera, no fabricated successful command. Agent 4 owns and tests runtime bridge validation and camera/permission feasibility; the shared types do not claim those features implemented.

Reviewer clarification: the port is bound to one controller/session identity and deadlines use that controller's clock. A content/background context cannot compare its own performance.now() directly against another context's timestamp; inject the controller clock or separately review clock translation.

## Handoff

Report the final reconciled passing commit as the common starting commit after independent checks. The human team shares/pushes it; the agent never pushes. Agent 1/2/4 create their assigned branches from it and consume src/care/index.ts. Hosted SQL/Auth and real two-device delivery still need connection and observed acceptance; UI/routes/extension are their subsequent feature work, with final integration owned by Agent 3. Do not mark C2-C6 complete or promise conflict-free merges.
