# Participant requests — integration hook for Agent 3

Feature-ready on `feature/participant-requests`; NOT integrated. Agent 3 owns every file below that is outside `src/features/participant-requests/`. Contract: design P1 revision 3 (`reasoning.md`), approved by p1_review.

## Exports (`src/features/participant-requests/index.ts`)

- `ParticipantRequestController` — constructor `{ client: CareClient | null, announce?: (text) => void, newId?: () => string }`. Methods: `view`, `subscribe(listener)`, `setActive(boolean)`, `activate(targetId): boolean`, `retry(id)`, `cancel(id)`, `pair(token)`, `signOut()`, `dispose()`.
- `ParticipantRequestsPanel` — props `{ controller, snapshot?: SessionSnapshot, onActivate?: (id) => void, disabled?: boolean }`. Renders nothing until the device is paired.
- `ParticipantPairing` — props `{ controller }`. Assisted pairing, identity, sign-out, revoked/caregiver/not-configured states.
- View fields the session uses: `view.targets` (stable ids `request:water|bathroom|reposition|help|cancel`, live labels, same array reference until something changes) and `view.identityGeneration`.

## Required wiring (session.ts / types.ts / App.tsx / CommunicationView.tsx — Agent 3)

1. **One controller per shared client.** Create it right after `createSupabaseCareClient(...)` (or with `client: null` when `parseCareConfig` is not ready). It starts `client.watch` itself. Dispose order: `controller.dispose()` then `await client.dispose()`.
2. **Publishing announce.** Add a public session method that announces AND publishes (the private `announce` does not publish in assisted mode, where no frames arrive). Pass it as `announce`.
3. **Stage gate.** On every stage change call `controller.setActive(stage === 'communication')`.
4. **Communication-only targets.** In `enterCommunication`, add `controller.view.targets` to the scan list, recommended AFTER Speak, Clear and Pause so Pause is not delayed (or as an "Ask caregiver" level once the C1 levels from `ethan-features` merge). Never add them to practice or setup lists. Record `view.identityGeneration` and the target id list at EVERY communication build (including `fallBackToAutomatic` and practice → communication).
5. **Hook placement.** In `activate(id, nowMs)`, call `if (controller.activate(id)) return;` only AFTER the `stage === 'communication'` check, so Practice ignores `request:*`.
6. **Rebuild rule.** In the `controller.subscribe` listener: if `stage === 'communication'` and either the target id list or `view.identityGeneration` differs from the recorded build, rebuild the communication targets synchronously (message preserved; scanner latch dropped; fresh neutral required). Then publish. Label-only changes never rebuild.
7. **One renderer, live labels.** `CommunicationView` must not render `request:*` targets (filter by id prefix, or add a `ScanTarget` kind such as `'request'`). Mount `ParticipantRequestsPanel` on the communication screen with `snapshot`, `onActivate={(id) => session.selectTarget(id)}` and `disabled={paused}`. When building `snapshot.scan.targets`, take `request:*` labels live from `controller.view.targets` by id.
8. **Pairing.** Mount `ParticipantPairing` in participant setup (the participant route). Local calibration remains separate; pairing never arms gestures.

Sketch (not applied here):

```ts
// session.ts (Agent 3)
private requestIds = ''; private requestGeneration = -1;
private requestTargets(): ScanTarget[] {
  const view = this.requests?.view;
  if (!view) return [];
  this.requestIds = view.targets.map((t) => t.id).join(','); this.requestGeneration = view.identityGeneration;
  return view.targets.map((t) => ({ id: t.id, label: t.label, kind: 'control' as const }));
}
// enterCommunication: [...phrases, speak, clear, pause, ...this.requestTargets(), ...rest]
// activate(): after `if (this.stage !== 'communication') return;` → `if (this.requests?.activate(id)) return;`
// subscribe listener: const v = requests.view;
//   if (this.stage === 'communication' && (v.targets.map((t) => t.id).join(',') !== this.requestIds || v.identityGeneration !== this.requestGeneration)) this.enterCommunication();
//   this.publish();
```

`enterCommunication` currently calls `setStage`, which resets the processor/runtime/scanner and therefore requires fresh neutral — the intended fail-safe for an identity change. The message array is not touched by `setStage`.

## Acceptance tests Agent 3 must run on the real session

Feature-level evidence on this branch uses the real `GestureRuntime` + `ScanController` (`gesture.test.ts`), not `MotifSession`. On the integrated session, add:

- One long hold on `request:water` → exactly one server row.
- Assisted Space reaches every request target; helper clicks go through `selectTarget` and are refused while paused.
- Tracking loss mid-dwell on a request target sends nothing; Pause blocks request selection.
- `request:*` selected in Practice → zero client calls.
- A latch begun under A1 sends nothing after a direct A1 → A2 switch (no idle snapshot between).
- After sending, `snapshot.scan.targets` and the screen show "Water: sending", with exactly one button per request target.
- Speaking or composing never calls `sendRequest` (spy on the client).

## Pending (human / hosted)

Hosted Supabase project, two real devices, real camera gestures, real Space switch, screen-reader check of the panel and pairing view.
