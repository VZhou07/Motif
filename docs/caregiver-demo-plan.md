# Selected connected caregiver demo plan

Status: the user selected **caregiver requests plus a limited browser companion prototype**, including real two-device delivery and deliberately sent request metadata, while camera/calibration data remains local. This supersedes the earlier no-backend/no-external-control scope for these bounded features only. It is an approved product direction; detailed engineering designs, contracts and technical reviews still precede implementation. No implementation agents, external services or deployments have been started. Keep the original checkout and the communication teammate's active work untouched.

## Product loop

Motif helps a person use comfortable movements to communicate a need, receive acknowledgment from a paired caregiver, and operate a small set of browser controls. A caregiver can support several explicitly paired people. The person controls what is sent; there is no camera monitoring dashboard.

First real demo: person A selects Send water request; caregiver on another device sees A's alias and request, acknowledges it, and A sees that acknowledgment. Person B sends a different request and remains distinct. A then uses a supported webpage and returns to communication using the available input.

## MVP defaults within the selected scope

- One care group with one caregiver and multiple paired participant devices; use demonstration aliases rather than medical records.
- Four request types: water, bathroom assistance, help changing position, and general assistance. Local speech/composition remains usable independently of network delivery.
- A clearly labeled request action sends one deliberately selected request. Speaking or composing a phrase never implicitly sends it to the caregiver. Extra remote free text is deferred.
- Participants see their own outstanding requests and can cancel them. Caregivers explicitly acknowledge and complete requests. A request on the caregiver screen alone is not proof that a person has read it.
- The caregiver dashboard remains open during the demo. It has an explicit Enable sound control and connection status; background/locked-phone push is excluded from the first slice.
- Transmit only pairing/auth traffic and the deliberately selected request's ID, participant alias/ID, kind, status, revision and timestamps. No video, landmarks, gesture streams, calibration profiles, browsing history or automatically uploaded composition.
- Retain requests for the demo session and allow the caregiver to clear/revoke the group afterward. Cross-session history/analytics is deferred. Retention and revocation must be implemented server-side, not merely hidden in the UI.
- A small HTTPS backend provides real two-device delivery. Transport/provider choice is a coordinator decision before implementation: a same-origin app/API is preferred; a hosted service needs an exact reviewed origin exception. External account creation, paid services and deployment still require their applicable approval; local preparation and scoped feature work do not require another product-scope question.
- Browser controls are Chrome-only for the first prototype: Scroll up/down, Back and Return to communication, on explicitly supported ordinary pages. Arbitrary OS control, sensitive form actions and automatic emergency detection are excluded.

## Four concurrent owners

Copy-ready assignments are in [agent-prompts.md](agent-prompts.md). The integration owner prepares the shared passing base/contracts first; other teammates may inspect/design concurrently before those contracts are ready. Per-workstream reasoning/progress files avoid four writers in root journals; see AGENTS.md.

| Owner / branch | Owned files and deliverable | Required acceptance |
| --- | --- | --- |
| 1: participant interface — `feature/participant-requests` | Existing communication teammate owns communication changes; new `src/features/participant-requests/` view/tests. Use the shared request client; keep recognition unchanged. Request choices, truthful delivery state, cancel, acknowledgment, existing gesture/Space operability. | One deliberate gesture selection creates one request; long holds do not duplicate it. Offline is not shown as Sent. Correct acknowledgment/cancel shown. Local communication remains available. |
| 2: caregiver dashboard — `feature/caregiver-dashboard` | New `src/features/caregiver/` views/tests and feature-scoped styles. Paired people, outstanding requests, explicit Acknowledge/Complete, connection state, optional enabled sound. | Two participants remain distinct; correct request updated; reconnect/replayed events do not duplicate cards; unpaired people absent; stale/disconnected state visible. |
| 3: backend and integration — `feature/request-relay` | `server/`, request contracts/client, pairing/auth, persistence/realtime, request tests, and sole ownership of shared session/routes/types/network-policy integration. Own plan/reasoning/progress coordination. | Scoped identities enforced server-side; unpaired access and participant impersonation rejected; retries are idempotent; invalid transitions/conflicting revisions rejected; reconnect fetches authoritative state; telemetry remains blocked. |
| 4: browser access — `feature/browser-access` | `extensions/motif/`, browser-command adapter and tests. Reuse the approved recognizer through one visible control authority. Prototype camera/runtime and Scroll-to-Return loop before adding commands. | Real gesture controls a supported page, returns to communication, and can send a request. Unsupported page explained. Pause/tracking loss cancels input. No actions from hidden/old sessions; no second simultaneous tracker. |

Only the integration owner changes shared `session.ts`, `types.ts`, app routing, dependency lockfile, profile schema and global network policy. Other owners request a contract change rather than editing those files independently. Each feature keeps its own styles/tests and commits small reviewed chunks. Do not distribute recognition fixes among all four branches.

## Accounts, pairing and access

This is a required working part of the selected build. Use two server-recognized roles: caregiver and participant. A Choose caregiver / Choose participant screen may guide setup, but changing that screen, a URL, a local-storage value or a request body must never grant permissions. Local calibration profiles and facial landmarks are not account authentication.

- Caregivers have real authenticated accounts/sessions and their own care group. One caregiver owns a group in the MVP; multiple independent caregiver accounts/groups must remain isolated. Pre-provisioned demo accounts are sufficient; public registration, email verification and password reset are outside this slice. No shared global caregiver password or account that sees every participant, and no demo password bundled into frontend code.
- A caregiver signs in, creates a participant alias and generates an invitation scoped to that participant/group. A helper may enter the random, single-use, expiring invitation on the participant device during assisted setup. Explain who will receive requests and confirm the pairing. Consume invitations atomically, rate-limit attempts and reject expired/reused/revoked codes. The backend issues a participant-scoped session; the invitation code is not the lasting credential, and email/password entry is not required for every participant.
- The signed-in caregiver can list/manage only their own paired people, issue/revoke their own invitations, revoke their own pairings, and acknowledge/complete their group's requests. Caregivers cannot impersonate a participant to fabricate requests.
- A paired participant can send, read and cancel their own requests. They cannot list another person's requests, acknowledge/complete requests, create caregiver privileges or choose an arbitrary sender/group. Selecting Send never accepts a client-supplied participant ID as authority.
- The backend derives identity/role/group from a validated session and checks the relevant ownership/pairing on every read, mutation, subscription and live event. A frontend filter is presentation, not access enforcement. Guessed IDs and direct API calls must not bypass this rule.
- Sign-out, expiry, account switch, invitation consumption and pairing revocation must have defined server behavior. Clear previous-user UI/cache/queued work and unsubscribe before changing identity; ignore responses/events from the old session. Revoked access must stop live updates and reject later writes, including on an already-open connection.
- Request retry records, saved network identities and browser-companion commands are scoped to the current authorized session. Never replay a previous person's queued request after another person pairs/signs in. Local calibration settings remain separate from caregiver account data. Switching the person controlling the camera disarms gestures and requires that person's appropriate calibration/profile revalidation; a new network identity is not evidence that the old physical control profile fits. Do not silently delete saved profiles.

| Identity | Allowed access | Required denial |
| --- | --- | --- |
| Signed out / unpaired | Local accessibility setup/communication; caregiver sign-in or explicit pairing | No shared requests or caregiver dashboard data |
| Paired participant A | Create/read/cancel A's requests using A's session | No participant B data; no caregiver actions; no arbitrary sender/group override |
| Caregiver A | Own paired people/invitations; own group requests; acknowledge/complete; revoke own pairings | No caregiver B group data; no participant impersonation |
| Expired/revoked session | Reauthentication/re-pairing and eligible local functionality | No further shared request access, stale event delivery or queued sends |

Use the same shared auth/session contract, role-aware routing and request-client implementation across the participant page, caregiver dashboard and browser companion. Include current-session loading, caregiver sign-in/sign-out, redeem invitation, disconnect/revoke pairing and identity-change notifications. The extension may need a reviewed transport/auth adapter, but it must not invent a second identity system, silently copy credentials/profiles between origins, or pass credentials through ordinary webpage messages. Display the current participant/caregiver identity and access state clearly. Pairing and local calibration are separate steps.

Agent 3 owns the auth/session contracts and backend enforcement. Agent 1 owns participant pairing/identity/status views; Agent 2 owns caregiver sign-in, paired-person management and invitation/revocation views; Agent 4 consumes the same participant-scoped identity and clears stale browser commands when it changes. Agent 3 wires and verifies all of these surfaces together.

Access design reference: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) (server-side permission checks, default denial, relationship-based access and authorization tests). Choose the actual auth mechanism in a bounded reviewed engineering design before implementation.

## Integrated completion contract

Each branch can be feature-ready; only the integrated app can satisfy C5. Agent 3 remains responsible for mounting real routes/views, connecting the real shared clients/backend, carrying identity/permissions correctly, configuring network access and wiring gesture/browser commands. A clean merge, passing isolated component tests or buttons connected to fixtures is insufficient completion evidence.

Required integrated acceptance:

1. Caregiver A signs in, creates/invites participant A1 and A2, and both pair through the actual flow. Reload restores the correct authorized session or clearly requires reauthentication; never silently chooses another identity.
2. A1 uses approved gesture/Space input to send Water. Only caregiver A receives it, explicitly acknowledges/completes it, and A1 receives the matching status. A2 remains distinct and can independently send a request.
3. Caregiver B and participant B1 in a separate group cannot read, subscribe to, alter or guess their way into A's data. A1 cannot access A2's data or perform caregiver actions. Test the backend directly in addition to UI visibility.
4. Retry/reconnect creates no duplicate requests, restores current authoritative state and does not replay an action under a changed identity. Logout/revocation stops old live events and denies new writes. Expired/reused/revoked invitations fail; concurrent redemption succeeds at most once. Identity changes leave no previous person's request cards, queued sends or browser commands active.
5. The chosen browser-controller architecture returns to the correctly paired participant communication surface and can send one real request. Hidden/tracking-lost or stale-identity input cannot send, scroll or execute a delayed action.
6. All feature branches' meaningful tests plus combined regression/typecheck/build and applicable browser/network checks pass after integration. Independently test the actual integrated tree; resolve functional integration failures as well as Git conflicts. Record unavailable real-camera, comfort and physical two-device checks as pending, with exact steps and owner.

The final handoff names tested commit, routes, account/pairing setup, required configuration, checks/evidence and remaining human steps. Do not tell the user everything is connected while required wiring or automated acceptance is unfinished. Work toward completion without asking the user to resolve routine engineering details.

## Shared contract before branching

The coordinator commits version 1 contracts on a reconciled, passing base before the four branches start. First integrate the current wink/conflict fixes and inspect the communication teammate's changes; do not blindly merge over active work.

- `CareRequest`: stable client request ID, backend-authorized participant/group IDs, request kind, server timestamps, status and monotonic revision. Alias comes from the authorized pairing record.
- `AuthSession`/access contract: authenticated caregiver account or paired participant identity, authoritative group/participant scope, current session revision/expiry and signed-out/revoked states. Provider/transport details stay behind a shared adapter; consumers must not invent their own role flag or credentials. Commit auth/pairing operations with request operations before dependent feature implementation.
- Local delivery: Pending/Failed. Server states: Sent, Acknowledged, Completed or Cancelled. Sent requires server acceptance/persistence; Acknowledged requires a caregiver action. Complete/cancel are terminal; concurrent changes must resolve against the authoritative server revision.
- Request-client operations: send, list own/group requests according to role, subscribe, acknowledge, complete, cancel and revoke pairing. Retry the same ID, never invent a new ID for the same pending send. Refresh authoritative state on reconnect.
- Workspace commands use stable IDs, an approved mapping/session epoch and explicit active scope. A gesture is resolved to one command; it cannot send a care request and scroll a page at once. Mode changes require fresh neutral and visible feedback.
- Frontends may use fixtures in tests while the relay is built. The final demo must use real gesture input and real network delivery, not simulated server success.

## Browser feasibility gate

Current Motif intentionally stops tracking and fails closed when its document becomes hidden. Opening another tab cannot leave a Return-to-Motif gesture working in that hidden page.

Preferred experiment: an opened, persistent Chrome extension side panel owns the single camera/runtime and a compact communication surface while controlling supported tabs. A helper may initially install/open it and approve permissions. Prove camera access, packaged local MediaPipe/WASM, CSP, visibility across tab changes and an approved gesture event before promising the feature. A camera event is not automatically a Chrome user-activation grant. Do not rely on it to reopen a closed panel or obtain host access.

Fallback: keep Motif visibly docked beside a supported webpage, with an extension executing the small command set. Return switches the visible Motif surface to communication. If neither real browser loop passes, ship the caregiver loop with a clearly scoped in-app reader instead; do not describe that as OS/browser-wide control. Closing/minimizing the visible controller suspends input, with assisted reopening available.

## Checkpoints and merge order

- [x] C0: User selected caregiver requests plus a limited browser companion prototype and request-only networking. Event identified as Hack the Valley; public theme/rules checked. Detailed hacker-package conditions remain unverified.
- [ ] C1: One reconciled passing base; versioned auth/session, pairing, request and browser-command contracts committed; four disjoint owners/branches named; each branch can run checks. Reviewed designs precede code.
- [ ] C2: Tiny vertical slice: real caregiver sign-in and participant pairing, Water request across two devices, correct caregiver acknowledgment back to sender. Integrate early while dashboard/input work continues.
- [ ] C3: Multiple participants plus separate-group denial tests, scoped pairing/revocation, cancellation, replay/reconnect and delivery-state tests. Privacy text/policies/tests updated for deliberate requests while camera processing and model-telemetry blocking remain local.
- [ ] C4: Browser camera/command/return experiment passes or the documented fallback is chosen. Integrate only the proven scope.
- [ ] C5: Four branches integrated by the coordinator; all Integrated completion contract criteria pass, including real auth/pairing/role-aware routing and cross-account authorization tests; independent testing, full regression/typecheck/build, two-device network test and browser interaction test pass. Record unavailable hardware/comfort evidence separately and keep overall acceptance pending until observed.
- [ ] C6: Rehearse the real demo with verified profiles. Show gesture-to-command personalization, request/acknowledgment, multiple paired people and return to communication. Label earlier calibration or test fixtures honestly. Leave local commits and handoff; never push automatically.

## AI claim and track eligibility

Motif uses pretrained machine-learning face detection, landmark and expression/blendshape models, followed by personal calibration, signal processing and state-machine recognition. This is computer-vision AI without an LLM. It is facial movement analysis, not identity recognition; do not claim to train a neural network or infer a person's needs/medical condition.

Suggested pitch: On-device AI turns each person's comfortable movements into personalized controls for communication and caregiver requests.

User identified **Hack the Valley 11 (October 16–18, 2026)**. Its public AI for Social Impact theme covers practical AI applications and emphasizes transparency and measurable impact; no LLM requirement was found in that theme or the public rules. Motif appears to fit that theme based on its real computer-vision input, but this is an inference rather than an organizer eligibility decision. Devpost refers participants to the hacker package for detailed category descriptions. Keep those details unverified until supplied.

Public rules allow up to four members and public libraries/APIs, and require project work within the event window. They list an initial submission on October 17 at 9 PM ET and final submission October 18 at 10 AM ET, while the page header says 8 AM. Plan conservatively for 8 AM and have the team verify the discrepancy; do not invent one definitive deadline. AI-track eligibility is separate from sponsor prizes with specific API requirements.

Event sources checked 2026-10-17: [Hack the Valley themes](https://hackthevalley.io/), [Devpost overview/category details](https://hack-the-valley-11.devpost.com/), [official public rules](https://hack-the-valley-11.devpost.com/rules).

Primary feasibility sources: [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker), [Chrome side panels](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
