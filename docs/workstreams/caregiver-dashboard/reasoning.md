# Caregiver dashboard — reasoning (workstream `caregiver-dashboard`, checkpoints C2/C3)

Branch `feature/caregiver-dashboard`, worktree `.cache/worktrees/caregiver-dashboard`, base `22aa5b4` (tip of `feature/request-relay`; source identical to the agreed common base `2055e1c`). Owner: this workstream. Allowed files: `src/features/caregiver/**` and this directory. Not touched: `session.ts`, `types.ts`, routes, `package*.json`, network policy, root journals, `src/care/**` (Agent 3).

## Revision 1 — design

### Goal and boundary
One screen, `CaregiverDashboard`, for ONE caregiver and several explicitly paired people. It consumes the shared `CareClient` (`src/care/contracts.ts`) passed as a prop, so the final path is the real Supabase-backed client; fakes exist only in tests. It never creates a schema, a second identity system, a transport or a network call of its own. Agent 3 mounts it (role-aware route) and owns the single client instance.

```ts
export interface CaregiverDashboardProps {
  client: CareClient;          // shared real client (one per visible control surface)
  sound?: SoundPort;           // default: Web Audio, created only on the Enable sound click
  clock?: { wall(): number; mono(): number };   // tests inject; default Date.now / performance.now
}
```

### What the contract gives us (verified in `client.ts`, `contracts.ts`, the migration)
- `watch(listener)` delivers whole authoritative `CareSnapshot`s about every 2 s; there are no incremental events. "Duplicate/replayed events" therefore means repeated or out-of-order snapshots.
- `epoch` increases on any identity change (sign-in, sign-out, pair, auth callback, dispose). `connection`: `idle | loading | online | offline`.
- A failed refresh publishes `{ access: signed-out, participants: [], requests: [], connection: 'offline', error }` WITHOUT changing the epoch. A genuine sign-out or an expired session publishes signed-out with `connection: 'idle'`. The dashboard must tell these apart: offline + same epoch ⇒ keep the last authoritative caregiver view, marked stale, with actions disabled; idle + signed-out ⇒ sign-in form.
- After a failed refresh the client nulls its credential; the next successful poll restores it. Actions are therefore disabled while offline/stale.
- Server transitions: caregiver may do `sent → acknowledged` and `acknowledged → completed` only; the sender cancels. So Acknowledge appears only on `sent`, Complete only on `acknowledged`; nothing else is offered. A concurrent change is rejected by the server (revision mismatch / not allowed) and surfaces as a `CareError`.
- Aliases are 1–60 chars and NOT unique; invitations expire after 10 minutes and are only valid for unpaired, un-revoked people; `clearGroup` revokes every person, deletes requests and invites, and keeps the group.
- `CareAccess` has no e-mail. "Current account" is therefore shown as role + group name + `receiver_name`, never a locally remembered e-mail.

### Pure model (`model.ts`, no React)
- `mergeRequests(previous: Map<id, CareRequest>, incoming: CareRequest[])`: the new map contains ONLY the incoming ids (a cleared request disappears); each value is the higher-`revision` of previous/incoming (incoming wins ties). A replayed older snapshot can never regress a card; the same id never appears twice.
- `scopeToGroup(snapshot)`: defensively drops participants/requests whose `group_id` differs from `access.group.id` and requests whose `participant_id` is not among the group's participants. This is presentation hygiene only; enforcement is the server's (RLS), which the shared client also re-checks.
- `displayNames(participants)`: alias by id; participants whose aliases are equal ignoring case/whitespace get a creation-order suffix ("Alex · person 2") so similar names stay distinguishable. All actions bind to ids, never aliases or list positions.
- `boardOf(...)`: active people (not revoked), removed people (revoked), outstanding requests (`sent` first, then `acknowledged`; each ordered by `created_at`, then id) excluding revoked participants, recent finished (`completed|cancelled`, newest 10, collapsed).
- `ageLabel(createdAt, nowWall)`: "just now", "45 s", "7 min", "1 h 05 min"; negative (clock skew) clamps to 0. The absolute server timestamp (local time) is shown next to it, because device-clock skew only affects the age estimate.
- `kindLabel`: water → "Water", bathroom → "Bathroom assistance", reposition → "Change position", help → "General help" (local table; hoisting a shared one is an integration hook for Agent 3/Agent 1).

### Hook (`useDashboard.ts`)
- Subscribes with `client.watch` and unsubscribes on unmount; also calls `client.refresh()` once on mount (errors swallowed — the snapshot carries the state) so a cold start does not flash the sign-in form: `ready` becomes true on the first snapshot with `connection !== 'idle'` or when that refresh settles.
- Ignores any snapshot whose `epoch` is lower than the highest already seen. On an epoch increase it discards ALL retained caregiver data (last-good board, request memory, sound-alert memory) before applying the new snapshot.
- `lastGood`: stored when `access.role === 'caregiver'` and `connection === 'online'`; used only while offline in the same epoch.
- `stale` = `connection === 'offline'` OR (`mono() - lastOnlineAt > 6000` ms, three missed polls) . A 1-second tick refreshes ages, invitation countdowns and staleness; the tick never re-announces.
- View state machine: `loading` | `signed-out` (idle + signed-out, optional "your session ended" notice when a board was shown before) | `unreachable` (offline, nothing retained: message + Retry) | `wrong-role` (participant/unpaired/revoked: explanation, no data, no sign-in) | `no-group` (caregiver without group: create-group form) | `board`.

### Screen and actions
- **Sign-in**: labelled e-mail and password fields (`autocomplete` username/current-password, `type=password`), submit with Enter; busy state; errors via `role="alert"` using only `CareError.message`/the snapshot's already-sanitized `error`. The password is cleared from state at submit; nothing is stored or logged. "Choose caregiver" is not offered; only `client.signIn` authenticates.
- **Header** (board): "Caregiver account · {group.name}", receiver name, connection badge (Connected / Connection lost), **Enable sound / Sound on (Turn off)** button, **Sign out** (`client.signOut`).
- **Requests**: `<ul>` of cards: alias, kind, status ("Waiting — not yet acknowledged" for `sent`, "Acknowledged" for `acknowledged`), age + absolute time, a NEW badge on `sent` cards. Buttons: "Acknowledge {kind} request from {alias}" (only `sent`), "Mark {kind} request from {alias} complete" (only `acknowledged`). Click → `client.transitionRequest(id, revision, status)` with the revision of the card the person saw. A card never calls the client by itself: rendering, replays and reconnects never acknowledge anything.
- In-flight: a per-request ref blocks a second click synchronously; the button shows "Acknowledging…". The displayed status changes ONLY when a later authoritative snapshot says so (the client reloads after a successful operation). On failure: `role="alert"` message ("That request changed before your action; showing the latest." for `invalid_*`/not-allowed errors, else the CareError message) and `client.refresh()`.
- **People**: add person (1–60 chars trimmed), per active person status "Paired" / "Waiting for pairing", "Create invitation for {alias}" (unpaired only) showing the single-use code in large monospace with a live "expires in m:ss", Copy code (clipboard if available), Hide code; the code lives only in component state, is cleared at expiry/hide/unmount/epoch change, and is never logged, put in a URL or stored. "Remove {alias}" opens an inline confirmation (Keep / Yes, remove) → `client.revokeParticipant(id)`. Revoked people appear under "Removed people" with no actions; their requests leave the outstanding list and never trigger sound.
- **Clear everything** (inline confirmation naming what happens: every person removed, open requests deleted) → `client.clearGroup()`.
- While `stale`/offline: a prominent `role="alert"` banner ("Connection lost. Showing information from {n} s ago; new requests may be missing."), all mutating buttons disabled with that reason, Retry now (`client.refresh()`), Sign out remains available.
- Text safety: all values rendered as React text (no `dangerouslySetInnerHTML`), aliases wrapped in `<bdi>`, `overflow-wrap:anywhere`.
- No camera, no video, no medical text, no fabricated events; explicit copy: "This is not an emergency alarm."

### Sound (`sound.ts`)
- `SoundPort { state; enable(): Promise<boolean>; disable(): void; chime(): void }`. The default Web Audio implementation creates the `AudioContext` ONLY inside `enable()` (invoked from the button click = user gesture), resumes it, plays one short confirmation tone, and reports `unavailable` if the API is missing/fails (the UI says so; visual NEW badges and the live region still work). `chime()` plays two short quiet tones inside try/catch.
- `AlertTracker` (pure, per epoch): `seen: Set<id>`. `arm(requests)` (called when sound is enabled) marks every currently outstanding id seen silently. `observe(requests)` returns the ids of `sent`, non-revoked requests not yet seen and records them; the component plays AT MOST ONE chime per applied snapshot. Replays, reconnects and re-renders never re-chime a seen id; a sound-off dashboard records nothing and chimes nothing. A new epoch builds a new tracker. Enabling sound mid-session does not blast the existing queue. No repeat/escalation chimes and no background/locked-phone alerts (explicitly out of scope; the copy says the dashboard must stay open and visible).

### Accessibility
Native `<button>`/`<input>`/`<form>`/`<details>` only; logical DOM order = tab order; visible focus (project `:focus-visible` rule is global); status changes in a polite live region (new request, acknowledged, connection restored), errors/offline in `role="alert"`; confirmations are inline (no `window.confirm`, no focus trap); after Acknowledge the focus returns to the list heading when the acting button disappears; every action button's name carries person and kind; targets ≥ 44 px; text ≥ 12 px (project `styles.test.ts` rule) and the same colour contrast tokens; reduced-motion respected (no animation required).

### Privacy
Only what the shared client already carries: ids, alias, kind, status, revision, timestamps. No new storage (no localStorage/IndexedDB/cookies), no logging of tokens/passwords/invitations, no network calls, no analytics. Sound preference is not persisted (a page reload needs a fresh click).

### Failure modes addressed
Similar/identical aliases; replayed/duplicate/out-of-order snapshots; stale revisions; reconnect after offline (stale cleared, no re-chime); offline cold start; transient offline snapshot that looks signed-out; expired session; caregiver B data after account change (epoch discard); foreign-group rows in a snapshot; revoked person with open requests; double-click; action racing a participant cancel; invitation expiry; sound before gesture; clipboard unavailable; hostile alias text; dashboard hidden/background tab (no promise made).

### Integration hooks for Agent 3 (reported, not edited here)
1. Mount `<CaregiverDashboard client={sharedClient} />` on the caregiver route; import `src/features/caregiver/caregiver.css` is done by the component itself.
2. Do not create a second `CareClient` for the same URL on that page (`createSupabaseCareClient` throws `client_exists`).
3. Optional: hoist `kindLabel` into a shared table; expose the caregiver e-mail in `CareAccess` if the "current account" line should show it.

### Test plan (all with a fake `CareClient` implementing the real interface, plus a real `CareService` over a fake transport)
Model unit tests (merge/stale revision/dedupe/scope/disambiguation/ordering/age/clamp); hook behavior (epoch discard, out-of-order snapshot ignored, offline retains + stale, idle sign-out shows form, cold-start no flash, unsubscribe on unmount); two people with identical and near-identical aliases acting on the right id/revision only; duplicate/replayed snapshots do not duplicate cards or call the client; a rendered card never auto-acknowledges; double-click → one call; failure → alert + refresh; reconnect refresh; revoked person; disconnected banner disables actions; invitation code shown, counts down, hidden at expiry and on epoch change; sound: none before enable, silent arm, one chime per new id, none for replays/acks/revoked, reset on account change, unavailable audio path, AudioContext created only on click; keyboard-only flow (Tab order, Enter/Space, confirmations, accessible names, focus after action); hostile alias rendered as text; caregiver B cannot see A (epoch change clears; foreign-group rows dropped); real `CareService` integration (offline then online; sign-out; sign-in flow). Then `tsc`, full `vitest`, production build.

### Review record
| Revision | Reviewer | Verdict |
| --- | --- | --- |
| 1 | pending | — |
