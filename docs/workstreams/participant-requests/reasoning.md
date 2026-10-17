# Participant requests — design (P1, revision 3)

Owner: Agent 1 (communication teammate), branch `feature/participant-requests`, worktree `.cache/worktrees/participant-requests` of the main checkout. Base: tip of `feature/request-relay` (`22aa5b4`; source identical to Agent 3's verified common base `2055e1c`). Checkpoints: C2/C3 participant side of `docs/caregiver-demo-plan.md`. Status: revision 1 BLOCKING (B1–B4); revision 2 BLOCKING (B5–B6, B1–B4 resolved); revision 3 resolves B5–B6 in place and was APPROVED by p1_review. Implementation in progress.

## Scope and boundaries

- Build: gesture-operable requests Water, Bathroom assistance, Help changing position, General help (`REQUEST_KINDS` = `water`, `bathroom`, `reposition`, `help`); truthful Pending / Failed (local) and Sent / Acknowledged / Completed / Cancelled (server); cancellation; participant pairing/identity view; who receives requests.
- Own only `src/features/participant-requests/**` and this folder. Do NOT edit `src/app/session.ts`, `src/app/types.ts`, routes (`App.tsx`), `src/care/**`, network policy (`src/tracker/offline.ts`, `index.html`), root journals, `package.json`/lockfile, or `CommunicationView.tsx`. Mounting and scan-list wiring are Agent 3's; this workstream delivers a typed hook and a ready-to-apply wiring contract (`integration.md`).
- Production code imports only `src/care/index.ts` (`CareClient`, `CareSnapshot`, `CareRequest`, `RequestKind`, `RequestStatus`, `REQUEST_KINDS`, `CareError`). Test-only exception: test support imports `CareService`/`CareTransport` from `src/care/client.ts` and the PGlite harness so tests run the real client logic against real SQL. Never construct the SDK; Agent 3 creates one `createSupabaseCareClient` per surface and passes it in. No competing API.
- Never transmit camera, calibration, gesture streams, message drafts or spoken text. The only remote calls are `pair`, `signOut`, `watch` (with its refreshes), `sendRequest`, `transitionRequest(..., 'cancelled')`.
- Communication-view changes: the existing communication screen is ours (communication teammate) but its C1 rework lives on `ethan-features` and is not in this base. This branch does not touch `CommunicationView.tsx`; the panel is a separate component Agent 3 mounts next to it (or inside C1's level structure once merged).

## Facts from the shared foundation that shape the design

- `sendRequest(id, kind)` → `motif_send_request` inserts `on conflict (id) do nothing` and returns the existing row: a retry with the same ID is idempotent; reusing an ID for a different kind/person is rejected. The client resolves only after the server returned the row AND a fresh authorized `load`. It can also REJECT after the row was stored (`session_changed` after the call, failed post-call `load`, `invalid_response`, timeout with lost response).
- `transitionRequest(id, revision, 'cancelled')`: sender may cancel from `sent` or `acknowledged`; `completed`/`cancelled` are terminal; stale revision → 40001 (surfaced as `CareError('request_failed')`).
- `CareSnapshot.epoch` increments on every auth change (sign in/out, pair, any SDK auth event including hourly token refresh) and on becoming `revoked`. `invalidate()` publishes `access: signed-out`, empty lists, `connection: 'loading'`. A failed refresh/poll keeps the epoch but publishes `access: signed-out`, empty lists, `connection: 'offline'` and drops the credential, so a send while offline rejects with `auth_required`. A load with no credential publishes `signed-out` with `connection: 'idle'`.
- Operations started under an older epoch reject with `session_changed`; the client never applies their results.
- Participant snapshots contain only that participant's requests (RLS plus the client's defensive check). `access.receiver_name` is the care group's name.

## Module design (`src/features/participant-requests/`)

### `controller.ts` — `ParticipantRequestController` (no React, no DOM)

```ts
type DisplayStatus = 'pending' | 'failed' | RequestStatus;
interface RequestCard { id: string; kind: RequestKind; status: DisplayStatus; revision: number | null; stale: boolean; reason: string | null; seq: number }
type RequestTargetId = `request:${RequestKind}` | 'request:cancel';
interface RequestTarget { id: RequestTargetId; label: string; kind: 'control' }
interface ParticipantRequestsView {
  identity: { state: 'not-configured' | 'connecting' | 'signed-out' | 'unpaired' | 'caregiver' | 'participant' | 'revoked'; alias: string | null; receiver: string | null; stale: boolean };
  connection: CareSnapshot['connection'] | 'none';
  cards: RequestCard[];              // own requests, newest first (by local seq)
  targets: readonly RequestTarget[]; // same array reference until the id set or a label changes
  cancelSubject: string | null;      // request id the Cancel target acts on
  identityGeneration: number;        // bumps on every authoritative owner change (incl. A1 → A2 with no idle between)
  pairing: { busy: boolean; error: string | null };
}
class ParticipantRequestController {
  constructor(options: { client: CareClient | null; newId?: () => string; announce?: (text: string) => void });
  get view(): ParticipantRequestsView;
  subscribe(listener: (view: ParticipantRequestsView) => void): () => void; // first subscriber starts client.watch
  /** Session sets true only while stage === 'communication'. Defaults to false. */
  setActive(active: boolean): void;
  /** Integration hook. Returns true for any `request:*` id (handled even if refused), false otherwise. */
  activate(targetId: string): boolean;
  retry(requestId: string): void; cancel(requestId: string): void;          // helper card buttons, same rules
  pair(token: string): Promise<boolean>; signOut(): Promise<void>;
  dispose(): void;                    // unsubscribe from the client; never disposes the shared client
}
```

- `newId` defaults to `crypto.randomUUID()`; if it is unavailable or throws, the send fails closed (no call, announce "This device cannot create a request ID; nothing was sent").
- `activate` returns false for every id outside `request:*`, so Speak, Clear, phrases and composition can never send. The controller has no access to the message or speech.
- When `setActive(false)` (practice, setup, mapping, etc.), `activate('request:*')` makes no client call and announces nothing; it returns true so no other handler acts on it.

### Identity, connection and stable targets (resolves B1)

- `owner`: the last AUTHORITATIVE identity `{ participantId, alias, receiver }` or null. Authoritative snapshots are: `connection === 'online'` (any role), and `connection === 'idle'` with `signed-out`.
- On an authoritative snapshot:
  - online `participant`: if `participant.id !== owner?.participantId` → drop all local entries, `lastKnown`, the cancel subject and announcement memory (identity changed). Set owner. Replace `lastKnown` with `snapshot.requests`. Remove local entries whose id is now on the server (server wins).
  - online with any other role, or idle signed-out → drop everything; owner = null; identity state from the role.
- Non-authoritative snapshots (`loading`, `offline`, including their transient `signed-out` access): keep owner, identity, `lastKnown`, local entries and the target id set unchanged; mark identity and cards `stale`. Identity state shows `participant` (stale) while an owner exists, `connecting` otherwise.
- `identityGeneration` increments whenever the authoritative owner changes in any way (null → A, A → B directly, A → null). A direct switch A1 → loading → online A2 (e.g. another tab re-paired) keeps the same five ids but bumps the generation, so the session rebuilds and any old latch is dropped.
- Our own `signOut()` clears owner, cards, subject and announcement memory immediately (generation bumps, targets leave) before awaiting the client; if the SDK sign-out fails and a later online snapshot shows the same participant again, the targets return (acceptable, truthful).
- Target id set: the five ids exist exactly while `owner !== null`. It therefore changes only on authoritative identity transitions (pair, sign-out, revoke, caregiver/unpaired), never on token-refresh epoch bumps or network blips. `targets` keeps the same array reference unless an id or label changes.
- While `connection !== 'online'`: `activate('request:<kind>')`, `request:cancel`, `retry` and `cancel` make no call and create no entry; announce "Can't reach the caregiver service right now. Nothing was sent." (or "...Nothing was cancelled."). Labels keep their last-known state; the panel shows the stale banner.

### Local delivery state

- `local: Map<id, { kind, phase: 'pending' | 'failed', owner: participantId, reason, seq }>` holds requests not yet confirmed by the server. `seq` is a monotonic counter on this controller (never a clock). Server requests seen first via a snapshot get `seq` assigned in server `created_at` order at the moment they first appear (stable afterwards); display order is by `seq`, newest first.
- In-flight results are applied only if the local entry for that id still exists with the same owner; identity changes delete entries, so an old-session result can never resurrect a card. A rejection marks the entry `failed` with a plain reason mapped from `CareError.code`, and any non-`CareError` rejection (fetch `TypeError`, `TimeoutError`) → "the caregiver service could not be reached": `auth_required` → "the caregiver service could not be reached"; `session_changed` → "the account changed during sending"; `request_failed` → "the service refused it"; `disposed` → "the request screen was closed"; other → "it could not be confirmed".
- No automatic retry. Retry is an explicit selection and reuses the same id.

### Request rules

- Not paired (`owner === null`): `activate('request:<kind>')` announces "Pair this device with a caregiver first" (targets are absent in this state, so this only covers helper/edge calls).
- Outstanding for a kind = local `pending`/`failed` or server `sent`/`acknowledged`. Per kind (online and active):
  - none → create id, add `pending`, set cancel subject to it, call `sendRequest(id, kind)`; announce "Sending water request."
  - `pending` → no call; subject = it; announce "Still sending the water request."
  - `failed` → retry the SAME id; subject = it; announce "Trying the water request again."
  - `sent`/`acknowledged` → no call; subject = it; announce its status ("Water is waiting for <receiver>. Select Cancel to cancel it.").

### Cancel subject (resolves B4)

- `cancelSubject` changes ONLY through the user's own actions: sending a request, selecting a kind (any branch above), or a successful/attempted cancel of it. It is never recomputed from timestamps or from other requests changing state. Initial value after load: null.
- `request:cancel` label: subject outstanding → "Cancel <kind> request"; otherwise "Cancel: select a request first".
- `activate('request:cancel')`:
  - subject null → announce "Select the request you want to cancel first, then Cancel." No call.
  - subject server `sent`/`acknowledged` → `transitionRequest(id, revision, 'cancelled')` once (per-id in-flight guard; repeat announces "Already cancelling the water request").
  - subject local `failed` → remove the local entry, subject = null; announce "Removed the unconfirmed water request. If it did reach your caregiver it will show here again." (M9: a later new water request gets a NEW id; reusing the old id could silently map to a completed/cancelled row.)
  - subject local `pending` → no call; announce "Wait until the water request finishes sending."
  - subject terminal (completed/cancelled) or gone → announce "The water request is already done. Nothing was cancelled." Subject = null. Never falls through to another request.
- Cancel rejection: refresh; if the server row's revision/status changed → "The water request changed before it could be cancelled. It is now <status>."; if unchanged → "Could not cancel the water request: <reason>. It is still <status>." Never re-cancel automatically.

### Targets and labels

- Stable ids: `request:water`, `request:bathroom`, `request:reposition`, `request:help`, `request:cancel`, present only while an owner exists. Labels change with state; ids do not.
- Kind labels: none → "Ask for water"; pending → "Water: sending"; failed → "Water: not confirmed, select to try again"; sent → "Water: sent, waiting"; acknowledged → "Water: <receiver> acknowledged". Kind names: Water, Bathroom assistance, Help changing position, General help.

### Truthful status wording (resolves B3)

- pending: "Sending — not confirmed yet."
- failed: "Not confirmed — it may not have reached your caregiver (<reason>). Select it to try again; this will not create a duplicate."
- sent: "Sent — your caregiver has not responded yet."
- acknowledged: "<receiver> acknowledged it."
- completed: "Done."
- cancelled: "Cancelled."
- stale suffix on every card while not online: "(last known, not confirmed right now)".

### Announcements (M2)

- One announcement per user action, plus one per (request id, status) transition observed from the server or a send result (sent, failed, acknowledged, completed, cancelled). Memory of announced (id, status) pairs is per owner, cleared on identity change; polls never repeat them. A user retry or cancel of an id clears that id's memory, so a second failure is announced again. Announce before notifying subscribers. Never include an invitation code in any announcement, error or view.

### `ParticipantRequestsPanel.tsx`

- Props: `controller`, `snapshot: SessionSnapshot` (only for scan highlight via existing `ScanButton`), `onActivate(id)` (Agent 3 passes `session.selectTarget`, so clicks follow the same paused/visible-target rules), `disabled` (paused or not communication).
- The panel is the ONLY renderer of request targets (B5): it reads labels live from `controller.view.targets`, never from `snapshot.scan.targets`. It shows the identity line ("Requests from Alex go to <receiver>"), connection state (when there is no owner and a pairing attempt failed, the pairing error is shown instead of the stale/offline banner), the five targets as large buttons, and cards newest first with status text and helper `Retry`/`Cancel` buttons. Helper buttons follow the same rules: disabled with `disabled`, refused while not online, Cancel acts only on that card (a helper's explicit choice of subject). Status is text, not colour only. No per-poll live-region chatter.

### `ParticipantPairing.tsx` (M6)

- Invitation code field → `controller.pair(token)`; the field is cleared after submit. Errors from pairing show as a pairing error ("Pairing did not complete. Check the code or ask for a new one."; `already_paired` → "This device is already paired.") rather than the generic offline banner.
- Shows the active identity (alias), who receives requests (`receiver_name`), and "Sign this device out" with the warning "This ends this device's pairing. Your caregiver will need to create a new invitation." → `controller.signOut()` (local cards cleared first).
- Caregiver session on this device: "Signed in as a caregiver. Sign out before pairing." Revoked: "Your caregiver removed this pairing. Ask for a new invitation." Not configured (client null): "Caregiver requests are not set up on this device. Local communication still works."
- No dropdown, URL or local flag can pick a sender; the only identity source is the client snapshot.

### Lifetime (M8)

One controller per shared client. Agent 3 calls `controller.dispose()` before `client.dispose()`. A `disposed` rejection gets a plain reason.

## Failure modes

| Risk | Handling |
| --- | --- |
| Long hold | Runtime emits one event per hold; plus one open request per kind. Feature-level test with real `GestureRuntime` + `ScanController`; real-session test is Agent 3's (integration.md). |
| Repeated select while sending | `pending` blocks; no second call. |
| Network blip / token refresh | Identity, targets and cards held (stale); no rebuild; sends refused while not online with "Nothing was sent". |
| Send rejected after the row was stored | Shown as "Not confirmed — may not have reached…"; next poll shows Sent; retry is idempotent. |
| Identity change (sign-out, re-pair, revoke, account switch) | Everything dropped on the first authoritative snapshot of another/no identity and immediately on our own sign-out; stale callbacks find no entry. |
| Cancel subject changes under the user | Subject only changes by user action; terminal subject refuses with "Nothing was cancelled". |
| Cancel race with acknowledge/complete | Server revision check; result reported against refreshed authoritative status. |
| Practice / setup | Session gates with `setActive`; targets only in communication; zero client calls. |
| Another participant's request | Never in this snapshot; foreign cancel rejected by SQL; tested with real SQL. |
| Unconfigured / unpaired | No request targets; local communication unaffected. |
| Privacy | Only request id/kind and cancel transitions leave the device via the shared client; no invitation code in UI/announcements after submit. |

## Tests (Vitest)

- Real backend path: `test-support.ts` builds a `CareTransport` over Agent 3's PGlite harness (actual SQL/RLS) wrapped in the real `CareService`. Details (M4): list queries return PostgREST-shaped JSON (`coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)`) so timestamps are strings; RPC args mapped by name with `name => $n`; SQL errors mapped to `CareError('request_failed')`; anonymous user ids generated by the fake auth. Only Auth JWT verification is simulated (as in the foundation's own tests). A switchable "offline" flag makes the transport reject.
- Controller: send once; same-kind repeat blocked; pending blocks; failed then retry keeps the id and leaves one server row; post-send `load` failure shows not-confirmed then Sent on next poll with one row; caregiver acknowledge → Acknowledged with receiver; complete → Done; cancel sent and acknowledged; cancel subject bound (caregiver completes subject mid-dwell → "Nothing was cancelled", other request untouched); seq ordering unaffected by skewed timestamps; cancel rejection wording for changed vs unchanged; remove failed local entry; speak/clear/phrase ids return false with zero client calls; inactive (practice) makes zero calls; direct switch A1 → loading → online A2 (no idle) bumps `identityGeneration` and clears A1 state; our own sign-out removes targets before the client resolves; a retry that fails again is announced again; a non-`CareError` rejection maps to "could not be reached"; identity switch A1 → sign out → pair A2 clears A1 cards, subject, announcements and queued failed entry, and a late A1 result does nothing; token-refresh epoch bump with same participant keeps entries and targets reference-equal and an in-flight `session_changed` shows not-confirmed then Sent; offline→online flap keeps targets reference-equal and sends nothing while offline; revocation clears and removes targets; caregiver session and null client states; announcement dedupe across polls; A1 never sees A2's request and a direct SQL cancel of A2's request as A1 is denied.
- Gesture access (feature-level evidence, M3): real `GestureRuntime(testModel)` + `ScanController` over the controller's targets: one long hold on Water → exactly one server row; dwell spanning a scan boundary selects the latched target; tracking loss mid-dwell → no request; direct commit (Space path) reaches every target.
- Components: panel renders statuses truthfully incl. stale; buttons call `onActivate` with stable ids; disabled state; pairing view pairs, clears the code, shows alias/receiver, pairing errors, sign-out warning, revoked/caregiver/not-configured states.
- Full `npx vitest run`, `npx tsc --noEmit`, `npm run build` before integration readiness. Real-session wiring, hosted Supabase, two devices, real camera and Space hardware remain pending.

## Integration contract for Agent 3 (resolves B2; full text in `integration.md`)

1. Create one controller per shared client: `new ParticipantRequestController({ client, announce })`, where `announce` is a NEW public session method that announces AND publishes (the private `announce` alone does not publish in assisted mode).
2. Call `controller.setActive(stage === 'communication')` on every stage change.
3. Add `controller.view.targets` ONLY to the communication-stage scan list, never practice/setup lists. Recommended placement: after Speak, Clear and Pause (or as an "Ask caregiver" level once C1 levels merge), so Pause is not delayed (M7).
4. In `activate(id)`, call `if (controller.activate(id)) return;` only AFTER the `stage === 'communication'` check; practice ignores `request:*`.
5. In the `controller.subscribe` listener: if `stage === 'communication'` and either the target id set OR `view.identityGeneration` changed since the last build, rebuild the communication targets synchronously (message preserved, latch dropped, fresh neutral required), so a latch begun under an old identity can never commit under a new one, including a direct A1 → A2 switch. Then publish. Label-only changes never rebuild.
5a. One renderer (B5): `CommunicationView` must skip `request:*` targets (id-prefix filter, or a new `ScanTarget` kind such as `'request'` in `types.ts`, Agent 3's choice); the panel renders them. The scan list still contains their ids for highlighting/selection. When building `snapshot.scan.targets`, take `request:*` labels live from `controller.view.targets` by id on every publish (the scanner holds only ids, so no rebuild is needed for a label change).
6. Mount `ParticipantRequestsPanel` on the communication screen with `onActivate={session.selectTarget}` and `disabled` when paused; mount `ParticipantPairing` in participant setup.
7. Dispose order: `controller.dispose()` then `await client.dispose()`.
8. Agent 3's real-session acceptance tests: one long hold on `request:water` → one row; Space reaches every request target; tracking loss mid-dwell sends nothing; Pause blocks; `request:*` in Practice → zero client calls; a latch begun under A1 sends nothing after a direct A1 → A2 switch (no idle snapshot between); after sending, `snapshot.scan.targets` and the screen show "Water: sending", with exactly one button per request target.

## Revision 3 changes (resolving p1_review re-check)

- B5: the panel is the single renderer of request targets with live labels; CommunicationView skips `request:*`; the session takes `request:*` labels live by id on publish; label changes never rebuild; acceptance test for one button per target and live label.
- B6: `identityGeneration` in the view; the session rebuilds on an id-set OR generation change (communication only); controller and session tests for a direct A1 → A2 switch.
- N1 retry/cancel clears that id's announcement memory; N2 non-`CareError` → "could not be reached"; N3 own sign-out clears owner/targets immediately; N4 pairing error shown instead of the offline banner when there is no owner.

## Revision 2 changes (resolving p1_review)

- B1: authoritative-vs-transient snapshot rule; identity/targets held through loading/offline/transient signed-out; target ids change only on authoritative identity transitions; no sends/cancels while not online, with truthful "Nothing was sent"; reference-equality tests.
- B2: `setActive` gate; integration contract specifies communication-only targets, hook after the stage check, synchronous rebuild only in communication, a public publishing announce, and practice zero-call tests.
- B3: Failed worded "Not confirmed — may not have reached…"; reason mapping; post-load-failure test.
- B4: cancel subject bound to user actions with a local monotonic sequence; terminal subject never falls through; mid-dwell completion and clock-skew tests.
- M1 cancel-rejection wording; M2 announcement dedupe/order/no token; M3 gesture tests labelled feature-level with real-session tests for Agent 3; M4 PGlite transport details and test-only import exception; M5 helper buttons same rules; M6 pairing errors, already_paired, sign-out warning; M7 placement; M8 lifetime and fail-closed id; M9 new id after removal; M10 added tests.

## Implementation notes (routine choices made while coding; no design change)

- The controller starts `client.watch` in its constructor instead of on the first subscriber, so a send result is reconciled even before the UI subscribes. `dispose()` unwatches.
- A send rejected with `session_changed` (account changed under it) is marked not confirmed silently and announced only when the next authoritative snapshot confirms the same person; if the person changed, the entry is dropped unannounced. This avoids a stale-session announcement during a switch (found by the direct A1 → A2 test).
- Card helper buttons have their own accessible names ("Cancel this water request", "Remove this unconfirmed water request") so they never share a name with the Cancel scan target.
- Component tests use a minimal stand-in `CareClient` because PGlite cannot load under jsdom; all delivery behaviour is tested against the real `CareService` and SQL in node-environment tests.

## Review record

| Revision | Reviewer | Findings / resolution | Verdict |
| --- | --- | --- | --- |
| P1 revision 3 | p1_review (re-check) | B5, B6 and N1–N4 resolved; no new blockers. Notes: list the non-CareError mapping as its own item; the session must record `identityGeneration` and the id set at every communication build (including fallBackToAutomatic and practice → communication); real-session tests stay Agent 3 acceptance. | APPROVED |
| P1 revision 2 | p1_review (re-check) | B1–B4 resolved. New B5: request target labels would be stale and duplicated because CommunicationView renders scan-target copies; B6: a direct A1 → A2 switch keeps the same ids so no rebuild and an old latch could commit as A2. N1–N4 non-blocking. All resolved in revision 3. | BLOCKING |
| P1 revision 1 | p1_review | B1 transient signed-out/offline snapshots would remove and re-add targets, rebuilding the scanner and cancelling dwells; offline send message misleading. B2 hook placement would send from Practice; rebuild/announce unspecified. B3 "not sent" false when the row was stored. B4 cancel target could cancel a request the user never chose. M1–M10 non-blocking. All resolved in revision 2. | BLOCKING |
