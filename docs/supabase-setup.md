# Supabase foundation setup

This guide covers the R16 database and shared client on `feature/request-relay`. It does not mean the participant/dashboard screens or browser companion are connected. Reconciliation with the latest main/communication work, the agreed passing contract commit, hosted verification and the complete C1-C6 demo remain separate gates. Do not overwrite another teammate's work or infer a ready base commit from this guide.

## Project and local configuration

You do not need to connect Supabase to GitHub. Use the Supabase Free project the user creates; no database password, service-role key or secret key needs to be sent to an agent or chat. The project URL and public publishable key are sufficient for the browser client; permissions come from authenticated sessions and database rules.

Each teammate copies [.env.example](../.env.example) to their own uncommitted `.env.local` and fills in these exact names:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

The URL must be the actual lowercase project origin, without an API path, query or credentials. Replace the placeholders before use. Use uppercase `VITE_`, not `NEXT_PUBLIC_` or lowercase names; Motif uses Vite, not Next.js. Prefer the public `sb_publishable_...` key; the parser also accepts a legacy JWT with role `anon`. It rejects service-role and `sb_secret_...` keys. Never put a database password, caregiver password or admin key in a `VITE_` variable, frontend source, screenshots or chat.

Restart `npm run dev` after changing environment files. For a production preview, rebuild with `npm run build` and restart the preview. The public configuration is compiled into the browser bundle; editing `.env.local` cannot change an existing build. `.env.local` is gitignored and is configured separately in each clone/worktree. No or invalid configuration disables care networking while local communication remains available. Optional local Supabase development accepts only `http://localhost:54321` or `http://127.0.0.1:54321`; Docker is not required for the hosted project.

## Apply the database once

1. In the correct Supabase project's SQL Editor, run the complete [foundation migration](../supabase/migrations/202610170001_care_foundation.sql) once. Record the migration filename/project in the team's private setup notes, without secrets.
2. This is a transactional first migration, not a repeatable reset script. If tables already exist or execution fails, stop and inspect the result with Agent 3. Do not drop existing tables or rerun fragments to force success.
3. Enable anonymous sign-ins in the project's Auth settings. Anonymous participant users still authenticate and receive a server-scoped identity; they are not public unauthenticated database access.
4. In Auth user management, create two separate email/password caregiver demo users and ensure their emails are confirmed. Keep passwords private and enter them through the sign-in form or private test harness. Public signup, password recovery and email delivery are outside this slice.
5. Do not enable care tables in Realtime publications. This foundation uses authorized polling every two seconds, with no Realtime channels, broadcast or WebSocket. Publishing DELETE notifications would not provide the required row privacy.

The migration creates RLS-protected `care_groups`, `participants` and `care_requests`, private hashed invitations/attempt counters and restricted RPCs. Browser users cannot directly insert/update/delete these tables. The server derives request sender/group from the authenticated session; an alias, URL, local profile or role dropdown cannot grant access.

`clearGroup()` deletes that group's requests, invitations and bound identities' invitation-attempt records, and revokes its participant bindings. It retains the group and revoked participant records so old sessions remain denied. Supabase Auth user records are separate and are not deleted by this RPC. There is no automatic end-of-session purge; use the caregiver's explicit clear/revoke flow after the demo. No video, calibration or message draft belongs in these tables.

## Shared API for all four branches

Use [contracts.ts](../src/care/contracts.ts), [client.ts](../src/care/client.ts) and [config.ts](../src/care/config.ts), rather than creating another backend schema, login store or SDK instance. The actual API exports are `CareClient`, `CareSnapshot`, `CareAccess`, `CareRequest`, `Invitation`, `RequestKind`, `createSupabaseCareClient` and `parseCareConfig`.

Integration example for a Vite module; Agent 3 mounts it once per visible control surface:

```ts
import { parseCareConfig } from '../care/config';
import { createSupabaseCareClient } from '../care/client';

const parsed = parseCareConfig(import.meta.env);
const care = parsed.status === 'ready'
  ? createSupabaseCareClient(parsed.config)
  : null;

// A view subscribes to snapshots, never to raw authentication tokens.
const stopWatching = care?.watch((snapshot) => renderCareState(snapshot));

// On final teardown, stop the view and await disposal before replacing the client.
stopWatching?.();
await care?.dispose();
```

`renderCareState` represents the owning teammate's view callback; it is not a prebuilt application function. The example shows lifecycle wiring, not an already mounted screen. Create one client and pass it to views. Never create separate same-project clients for each component; await `dispose()` before a replacement sharing persisted Auth storage. Ordinary tabs in one browser profile share that project's session, so use distinct browser profiles/devices for different people.

`snapshot.epoch` changes when access is invalidated. Consumers must clear previous-user request cards, pending commands and queued sends when identity/epoch changes, and respect `snapshot.connection`, `snapshot.access.role` and errors. Do not retain an earlier participant ID as a sender override. Auth changes/data operations are serialized and HTTP data requests carry the captured session token; do not bypass this client with a second SDK.

Use `watch()` for authorized snapshots and `refresh()` for an explicit refresh. The watch uses non-overlapping two-second polling and may take longer during network delays. It is not instantaneous delivery or a background alarm. Unsubscribe when a view stops observing; dispose only when the shared client is no longer used. Sign-out clears local access, but an issued provider access JWT can remain valid until expiry; database pairing revocation independently denies later participant requests.

## Hosted smoke test: real separate identities

These are tests to perform after applying SQL and wiring the real client into the UI or a private test harness. They are not completed results. Keep credentials/tokens out of logs. Two browser tabs in the same profile are not two identities. For a physical two-device test, each teammate can run the frontend locally on their own laptop with the same public project configuration; use HTTPS or localhost for any camera/controller page.

| Context | Actual shared-client operations | Expected result |
| --- | --- | --- |
| Caregiver A | `await care.signIn(email, password)`; `await care.refresh()`; if `snapshot.access.group` is null, `await care.createGroup('Demo A')` | Role caregiver; only A's group. Create the group once, not after every reload. |
| Caregiver A | `const a1 = await care.createParticipant('Person A1')`; `const invite = await care.createInvite(a1.id)` | An unpaired person and one invitation expiring in ten minutes. Display its token only to the intended helper/device, never persist it in logs. |
| Participant A1, separate profile/device | `await care.pair(inviteToken)`; inspect `care.snapshot` | Anonymous Auth sign-in plus invitation redemption; role participant, matching participant and `receiver_name`. Pairing while signed in as a caregiver is refused. |
| Participant A1 | `const id = crypto.randomUUID()`; `const request = await care.sendRequest(id, 'water')` | One server-accepted request, status sent. On uncertain failure retry the SAME `id` and kind, not a new UUID. Pending/Failed remain UI states; errors are never Sent. |
| Caregiver A | Wait for `watch()` or call `refresh()`; choose the matching request from A's own `care.snapshot.requests`; `const ack = await care.transitionRequest(request.id, request.revision, 'acknowledged')`; then `await care.transitionRequest(ack.id, ack.revision, 'completed')` | Only the explicit caregiver actions advance status. A1 receives the matching status on an authorized refresh/poll. Use the returned current revision. |
| Participant A1 | Send another request, then `await care.transitionRequest(id, currentRevision, 'cancelled')` | Cancels only A1's nonterminal request. Stale revisions and terminal-state changes fail; refresh before resolving a race. |
| Caregiver A / A2 | Create a second participant/invite; pair a different isolated context and send `help` | A sees both people distinctly; A1 and A2 each see only their own requests. |
| Caregiver B / B1 | Sign in as the other confirmed caregiver, create Demo B and pair B1 | No A group/participant/request data in B's snapshots. Direct cross-group RPC mutations and cross-participant reads must also be denied server-side, not just hidden by UI filters. |
| Caregiver A / A1 | `await care.revokeParticipant(a1.id)`; A1 refreshes or polls, then attempts another send | A1 becomes revoked, its request state clears and writes fail even with a previously issued valid access token. Reused, expired or revoked invitation redemption fails. |
| Any context | Begin a delayed request, then sign out/switch identity; reconnect; finally unsubscribe and `await care.dispose()` | No old response/queued action becomes the new person's state or request. Local communication remains usable. No stopped watch keeps polling. |

Also exercise caregiver denial of participant impersonation, participant denial of acknowledgment/completion, direct table mutation denial, simultaneous invite redemption (at most one winner), idempotent retry and mismatched-kind denial, reconnect refresh, and `clearGroup()` retention/revocation. Direct REST authorization checks require a private harness with that context's real authenticated session; do not expose a token through page messages or copy one into chat to run them.

## Verification limits and handoff

Run the relevant local suites, `npm run typecheck` and `npm run build`. The database tests execute real migration/RLS/RPC SQL in PGlite with authenticated test roles; they do not verify hosted Auth JWT processing, hosted concurrency, hosted polling, network permissions or physical two-device/camera behavior. Client tests inject controlled transport failures; they do not establish hosted delivery. Record those checks separately as pending until observed.

The foundation is only Agent 3's shared backend/client starting point. Agent 1 still owns participant views, Agent 2 caregiver views and Agent 4 the reviewed visible browser companion. Agent 3 must reconcile the passing branch base, publish the actual contract commit IDs for humans to share, mount role-aware routes and independently verify the complete [integration contract](caregiver-demo-plan.md#integrated-completion-contract). The agents do not push, deploy or silently merge over an active teammate checkout. The UI/extension must not claim completion from this setup guide alone.
