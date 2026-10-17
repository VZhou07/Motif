# W1 — Wire participant requests into the app, revision 2

Status: revision 1 BLOCKED by w1_review (B1: an identity rebuild silently undid Pause). Revision 2 resolves B1 and folds in non-blocking items 1–5, 7, 8, 9 and 11; re-review of B1 requested. Coordinator acting as Agent 3 (Agent 3 offline; user asked on 2026-10-17 for the coordinator to finish Agent 3's remaining wiring). Browser companion (Agent 4, C4) is out of this slice by user decision. Branch `feature/request-wiring` from `main` `24e9c6b`. Never push.

Source of the hook: `docs/workstreams/participant-requests/integration.md` (steps 1–8). Step 4 predates the R18 levels; this revision replaces it with an Ask level.

## Contracts

- `SessionOptions.requests?: RequestPort` — the session sees only `{ view: { targets: readonly ScanTarget-like {id,label}[]; identityGeneration: number }; activate(id): boolean; setActive(active): void; subscribe(listener): () => void }`. `ParticipantRequestController` satisfies it structurally; tests can pass the real controller over the test transport.
- `navigation.ts`: new `Level` value `'ask'`. `LevelContext.requests: readonly ScanTarget[]` (empty when not paired or not configured).
  - Communication top level: `speak, undo, ...groups, pause, ask (only when requests non-empty), more` — Pause keeps its position whether paired or not. The `ask` tile is `{ id: 'ask', label: 'Ask caregiver', kind: 'group' }` so it renders as a tile.
  - Ask level: `...requests (kind 'control'), back, pause`. Practice never shows `ask` or `request:*`.
  - `effectiveLevel(level, vocabulary, stage, hasRequests)`: `'ask'` falls back to `top` in practice or when there are no request targets.
- `LevelView.kind` gains `'ask'`; the communication heading reads "Ask your caregiver".
- `MotifRuntime` gains optional `requests?: ParticipantRequestController`; Root → `useMotif` → App → `CommunicationView`/`WelcomeView`. Without it (existing tests' runtimes) neither the panel nor the pairing card renders.
- `ScanTarget` ids `request:water|bathroom|reposition|help|cancel` come only from the controller.

## Behaviour

1. Root creates ONE `ParticipantRequestController` per participant session, with the page's single shared care client (`sharedCareClient()`, already shared with the caregiver route) or `client: null` when not configured. It is created before the session and passed in `SessionOptions.requests`; `announce` is `(text) => sessionRef?.announceExternal(text)`, bound after the session exists; `announceExternal` sets the announcement and publishes (works in assisted mode with no frames). Two statuses in one controller update: only the last is heard (recorded limit).
2. `setStage` calls `requests.setActive(stage === 'communication')` on every stage change.
3. `activate(id)`: `ask` → `setLevel('ask')`, announce "Ask your caregiver: N choices." Only after the existing `stage === 'practice'` return, `request:*` → `if (requests.activate(id)) setLevel('top')` (the controller's own announcement stands; no extra session announcement overwrites it). Pause/Back unchanged. Practice therefore never reaches the controller.
4. Session subscribes to the controller in its constructor. Listener: compute the id list + `identityGeneration`. If the stage is communication and either differs from what the current scan list was built with:
   - **not paused** → `enterCommunication()` (new scanner/runtime, highlight reset, latch dropped, fresh neutral required; message kept) and announce `"Caregiver requests are ready. Starting from the main list."` or `"Caregiver requests are no longer available. Starting from the main list."` (prefixed `"Not saved. "` when leaving the confirm level).
   - **paused (B1)** → do NOT rebuild; set `requestsStale = true`. The scanner stays paused, so the next Space press / select hold only resumes. `resumeScan` treats `requestsStale` like a phrase change: it resumes at the main list rebuilt from the current targets (`setLevel('top')`, which also cancels any latch), clears the flag and announces `"Resumed at the main list because caregiver requests changed."`. While paused, `selectTarget` and `selectRequest` refuse, and the controller refuses sends with no owner, so stale request ids cannot act.
   Label-only changes → build a NEW `scanTargets` array with the live `request:*` labels (never mutate the published one), keep highlight and latch, then publish. Recorded ids/generation are updated at every `levelTargets()` build.
5. Helper (pointer) clicks on the request panel call new `session.selectRequest(id)`: refused unless stage is communication, not paused and `id` is a current request target; opens the Ask level when needed, then activates. This mirrors the existing `openGroup` helper shortcut (and, like it, prefixes "Not saved." when it leaves the confirm level); gesture/Space input never use it.
6. `CommunicationView` never renders `request:*` targets (filters them out of tiles/toolbar). It mounts `ParticipantRequestsPanel` (live labels, status cards, retry/cancel) with `snapshot`, `onActivate={session.selectRequest}`, `disabled={paused}`; the `ask` tile renders like a group tile. In the Ask level the panel renders directly under the level heading (where the highlight is); elsewhere below the composer. Hidden in Practice.
7. Pairing: `WelcomeView` gets a "Caregiver requests" `<details>` card mounting `ParticipantPairing`; also reachable from the communication screen's helper area. Pairing never arms gestures or changes calibration.
8. Root disposes in order `controller.dispose()` then the shared client is left to the page (it is shared with the caregiver route).

## Failure modes and tests (Vitest on the real `MotifSession`, controller over the existing care test transport)

- Unpaired/not configured: no `ask` tile; top list identical to today (existing tests unchanged).
- Paired: `ask` tile appears; selecting it then `request:water` with one long hold → exactly one `sendRequest` call; highlight back on top.
- Practice: `request:*` via `selectTarget`/`selectRequest` → zero client calls; no `ask` tile.
- Paused: `selectRequest` refused; nothing sent.
- Identity change (pair A1 → revoked / generation bump) while in the Ask level → scan list rebuilt at top or without `ask`, latch dropped, nothing sent for the old identity.
- Label change ("Water: sending") updates `snapshot.scan.targets` label without resetting the highlight.
- Speak/compose never calls `sendRequest`.
- Component: CommunicationView shows the panel once, no duplicate request buttons; pairing card on Welcome.
- B1: paused (assisted and gesture), then the generation bumps / pairing is revoked → still paused; the next Space press only resumes (at top), zero `speak` and zero `sendRequest` calls.
- Rebuild announcements; Ask after Pause in the top list.
- Then full `tsc`, full vitest, `npm run build`, `npm run test:browser`.

## Out of scope / pending

One Auth identity per browser profile (`client.ts` storage key per host): the caregiver page and a paired participant in the same browser profile share one account. It fails closed (server-derived role; pairing as caregiver is refused; a caregiver sign-in on the participant page clears request targets). The A1/A2/caregiver demo needs separate devices, browser profiles or incognito windows. A network identity change does not prove the person at the camera changed; the local movement profile stays and only fresh neutral is required.


Browser companion (C4). Hosted Supabase checks need the user to enable anonymous sign-ins (Auth settings show `anonymous_users: false` on 2026-10-17) and set `VITE_` names in `.env.local`. Two real devices and real camera remain pending human checks.
