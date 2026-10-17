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

## Shared contract before branching

The coordinator commits version 1 contracts on a reconciled, passing base before the four branches start. First integrate the current wink/conflict fixes and inspect the communication teammate's changes; do not blindly merge over active work.

- `CareRequest`: stable client request ID, backend-authorized participant/group IDs, request kind, server timestamps, status and monotonic revision. Alias comes from the authorized pairing record.
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
- [ ] C1: One reconciled passing base; versioned contracts committed; four disjoint owners/branches named; each branch can run checks. Reviewed designs precede code.
- [ ] C2: Tiny vertical slice: real Water request across two devices, correct caregiver acknowledgment back to sender. Integrate early while dashboard/input work continues.
- [ ] C3: Multiple participants, scoped pairing, cancellation, replay/reconnect and delivery-state tests. Privacy text/policies/tests updated for deliberate requests while camera processing and model-telemetry blocking remain local.
- [ ] C4: Browser camera/command/return experiment passes or the documented fallback is chosen. Integrate only the proven scope.
- [ ] C5: Four branches integrated by the coordinator; independent testing, full regression/typecheck/build, two-device network test and browser interaction test pass. Record human comfort and actual gesture reliability separately.
- [ ] C6: Rehearse the real demo with verified profiles. Show gesture-to-command personalization, request/acknowledgment, multiple paired people and return to communication. Label earlier calibration or test fixtures honestly. Leave local commits and handoff; never push automatically.

## AI claim and track eligibility

Motif uses pretrained machine-learning face detection, landmark and expression/blendshape models, followed by personal calibration, signal processing and state-machine recognition. This is computer-vision AI without an LLM. It is facial movement analysis, not identity recognition; do not claim to train a neural network or infer a person's needs/medical condition.

Suggested pitch: On-device AI turns each person's comfortable movements into personalized controls for communication and caregiver requests.

User identified **Hack the Valley 11 (October 16–18, 2026)**. Its public AI for Social Impact theme covers practical AI applications and emphasizes transparency and measurable impact; no LLM requirement was found in that theme or the public rules. Motif appears to fit that theme based on its real computer-vision input, but this is an inference rather than an organizer eligibility decision. Devpost refers participants to the hacker package for detailed category descriptions. Keep those details unverified until supplied.

Public rules allow up to four members and public libraries/APIs, and require project work within the event window. They list an initial submission on October 17 at 9 PM ET and final submission October 18 at 10 AM ET, while the page header says 8 AM. Plan conservatively for 8 AM and have the team verify the discrepancy; do not invent one definitive deadline. AI-track eligibility is separate from sponsor prizes with specific API requirements.

Event sources checked 2026-10-17: [Hack the Valley themes](https://hackthevalley.io/), [Devpost overview/category details](https://hack-the-valley-11.devpost.com/), [official public rules](https://hack-the-valley-11.devpost.com/rules).

Primary feasibility sources: [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker), [Chrome side panels](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
