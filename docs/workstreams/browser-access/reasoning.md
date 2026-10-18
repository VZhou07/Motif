# Browser access (Agent 4, checkpoint C4) - reasoning, revision 1

Owner: Agent 4 on `feature/browser-access` (base `1e94ede`). Owned files: `extensions/motif/**`, `src/features/browser-access/**`, this folder. Shared files (session, routes, types, profiles, manifests, lockfile, vite.config.ts, root docs) belong to Agent 3: this document only PROPOSES hooks (section 9). Read first: AGENTS.md, plan.md, reasoning.md, progress.md, `.agents/skills/motif-checkpoint/SKILL.md`, `docs/caregiver-demo-plan.md` (Browser feasibility gate, C4, C5, Accounts), `docs/agent-prompts.md` (Agent 4), `src/care/browser-contract.ts` (frozen v1).
Status: DESIGN ONLY. Not yet reviewed. No code exists. Nothing here is human-accepted.

## 0. Goal and the one loop to prove

One approved input selects a Scroll command, the page scrolls, a later selection returns to the communication view of the SAME paired participant, and a request can still be sent. Commands are exactly `scroll-up`, `scroll-down`, `back`, `return-to-communication` (frozen `BrowserAction`). No typing, clicking, form or OS control. Camera data never leaves the device; only the existing deliberate care traffic does.

## 1. Architecture decision

**Chosen: persistent Chrome MV3 side panel hosting the built Motif app (the ONE visible camera/runtime), plus a service worker used only as a command executor.**

- Side panel page = the normal Motif React app built for `chrome-extension://<id>/sidepanel.html`. It owns camera, FaceTracker, MotifSession, scanning, care client and the Browser controls card. Local MediaPipe model and WASM are packaged at the extension root so the existing absolute paths `/mediapipe/wasm` and `/models/face_landmarker.task` resolve unchanged (publicDir of the extension build is the repo `public/`).
- Service worker (`background`): no tracker, no UI, no camera. It receives validated messages from the panel and runs `chrome.scripting.executeScript` (scroll) or `chrome.tabs.goBack` (back) on ONE bound tab. It keeps its state only in `chrome.storage.session` because MV3 workers are suspended.
- Return to communication never touches Chrome: it is a scan-scope switch inside the panel (the panel is already visible next to the page). This is why the side panel beats a tab-based design: Motif never leaves the screen, so the hidden-page rule is not violated by browsing.
- Why a worker at all (decision, not accident): privilege separation. The panel runs a large dependency tree (React, Supabase SDK); only the small worker holds the tabs/scripting calls and re-validates every command itself, so a bug or injected value in the panel cannot widen what the worker will do.

**Executor seam.** `CommandExecutor` is an interface (`run(action, binding) -> outcome`). Implementations: `ChromeTabExecutor` (worker, primary), `ReaderExecutor` (fallback 2, bundled in-app reader). The port, controller, host hooks and tests are identical across them.

**Fallback 1 - visible docked window.** `chrome.windows.create({type:'popup', url: sidepanel.html})` placed beside the page by a helper; same page, same worker, same port. Differences: the page has `sender.tab` (allowed, see 3.1), it can be minimized or occluded (fails closed by the existing hidden rule), and it controls the active tab of a DIFFERENT window (binding stores `windowId`). Trigger: side panel cannot hold camera/tracker visibly across tab switches on a human trial.

**Fallback 2 - in-app reader.** Only if both real-browser loops fail. State the failing evidence in progress.md first. Bundled static article pages inside Motif, same four tiles, scroll by `scrollBy` on the reader element; Back = reader history. Described as "reading inside Motif", never as browser control.

**Hidden rule (unchanged).** `FaceTracker` reports `stale` and `MotifSession.setHidden` fails closed when `document.hidden`. We add nothing that bypasses it. A closed side panel destroys the page: tracking stops, nothing can reopen it by gesture (`sidePanel.open` needs a real user gesture, camera events are not user activation, and a worker cannot grant itself host access). Reopen is helper-assisted: click the Motif toolbar icon (panel behavior `openPanelOnActionClick`). While the panel is closed no command can exist, because only the panel issues commands.

**Single runtime.** Within the extension origin, `navigator.locks.request('motif-runtime-v1', {ifAvailable:true})` is held for the page lifetime; a second panel or popup copy shows "Motif is already running in another window" and starts no tracker. Across origins (the localhost web app on the same machine) a second tracker cannot be prevented technically: it is an operating rule (helper closes it) and stays a human-pending check.

## 2. What was verified and what was not (this session)

Probe run, scratchpad only (no repo code, nothing installed): Chrome for Testing 153.0.8010.12 from the existing Playwright cache, `launchPersistentContext`, `--load-extension`, Chrome fake camera device (the real webcam was NOT opened). Probe scripts are throwaway; chunk 8 recreates them as `extensions/motif/scripts/probe.mjs`.

| # | Finding | State |
| --- | --- | --- |
| V1 | MV3 unpacked extension loads headless, worker starts, `chrome.sidePanel`, `scripting`, `tabs.goBack`, `navigator.locks` exist | verified |
| V2 | Extension-page CSP `script-src 'self' 'wasm-unsafe-eval'` allows WebAssembly; `eval` is blocked | verified |
| V3 | `getUserMedia` from an extension page works on the fake device | verified (permission UI bypassed by the flag) |
| V4 | The exact pinned MediaPipe 1.1.1 bundle + local wasm + local `face_landmarker.task` (CPU delegate, numFaces 2, blendshapes) created and ran `detectForVideo` inside an extension page. MediaPipe's built-in telemetry POST to `odml.pa.googleapis.com` was refused by manifest CSP `connect-src 'self'` (second layer behind `installOfflineGuard`) | verified |
| V5 | `scripting.executeScript` + `window.scrollBy` scrolled a granted page (0 -> 500); `tabs.goBack` worked; goBack with no history rejects "Cannot find a next page in history."; injecting into a navigating frame rejects "Frame with ID 0 was removed." | verified |
| V6 | `onMessage` sender exposes `id`, `url`, `origin`; `sender.tab` is set when the extension page is in a tab | verified |
| U1 | The real side panel (open, stays open across tab switches, `document.visibilityState` while another tab is active or the window is minimized/occluded) | UNVERIFIED, needs a human in Chrome 155 |
| U2 | Camera permission prompt inside a side panel (known risk: prompts for extension panels may not render; fallback is a one-time grant from `chrome-extension://<id>/sidepanel.html` opened in a tab) | UNVERIFIED |
| U3 | `chrome.permissions.request` from the panel on a helper click for an `optional_host_permissions` origin, and `tabs.onUpdated` event content without the `tabs` permission | UNVERIFIED |
| U4 | Branded Chrome 155 loads the unpacked build (the `--load-extension` flag is not honored by branded Chrome; the human uses chrome://extensions > Load unpacked; automation uses Chrome for Testing) | by documentation, UNVERIFIED here |
| U5 | Chrome API behavior from official docs as I know them (sidePanel since 114, `sidePanel.open` since 116 needs a user gesture, global panel by default, activeTab is temporary and gesture-granted): not re-fetched this session | documentation recall |

Automation limits: headless can load the extension, run its page and worker, drive a normal tab and use the fake camera, so most logic and the Space-switch loop (assisted input substitutes for the gesture, see section 7) are machine-testable. It cannot open the real side panel UI, observe true visibility semantics, use a real face or webcam, or show comfort. Those stay pending with exact steps in progress.md.

## 3. Message protocol and security

### 3.1 Trust boundary
Only the Motif controller page may issue commands. The worker accepts a message only if ALL hold: it arrives through `chrome.runtime.onMessage` (no `onMessageExternal`, no `onConnect`, no `externally_connectable`, no content scripts in the manifest, so web pages and injected scripts cannot reach it); `sender.id === chrome.runtime.id`; `sender.origin === new URL(chrome.runtime.getURL('')).origin`; `new URL(sender.url).pathname === '/sidepanel.html'`; `sender.frameId === 0`; and if `sender.tab` exists it is not the bound target tab (the controller cannot control itself). The injected scroll function runs in the isolated world, takes numbers only and returns `{before, after, scrollable}`; the page cannot call it, and its result is treated as untrusted data (never as a reason to enable anything).

### 3.2 Messages (versioned, panel to worker, JSON-only)
- `motif/bind {v:1, panelId, identityKey, accessEpoch, inputEpoch, tabId, windowId, origin}` - worker re-reads the live tab (`tabs.get`), checks `status`, top-frame origin equals `origin`, and `permissions.contains({origins:[origin+'/*']})`; stores the binding in `storage.session` (replacing any previous one). `panelId` is a random UUID per page load; `identityKey` is `participant:<id>` or `local`.
- `motif/command {v:1, panelId, command: BrowserCommand, ttlMs}` for `scroll-up|scroll-down|back` only.
- `motif/release {v:1, panelId}` - clears the binding.
Responses are `BrowserCommandResult` (`reason` carries a code from 3.5). `return-to-communication` is executed in the panel and is never sent to the worker.

### 3.3 `createBrowserCommandPort` (panel side, implements frozen `BrowserCommandPort`)
Runtime validation before anything is sent, reject codes in brackets:
1. `version === 1` [bad-version]; `id` is a non-empty string of at most 64 characters [bad-id]; `action` in the whitelist, own-property lookup, no prototype keys [unknown-action].
2. `Number.isFinite` for all numbers; `issuedAtMs <= now + 50`, `expiresAtMs > now`, `0 < expiresAtMs - issuedAtMs <= 2000` [invalid-times / expired / not-yet-valid]. Clock is the injected controller monotonic `now()` (`performance.now`); default TTL 1500 ms.
3. `inputEpoch === host.inputEpoch()` and `accessEpoch === host.accessEpoch()` and identity key equals the bound key [stale-input-epoch / stale-access-epoch / identity-changed].
4. `host.scope() === 'browser'` for tab actions [wrong-scope]; a binding exists [not-bound]; no other command in flight [busy]. Never queued.
5. `id` not seen in the last 256 accepted ids of this page [duplicate]. The id is recorded on acceptance, before sending, so a failed command is never retried under the same id (the person must select again after fresh neutral).
6. On send, `ttlMs = expiresAtMs - now()`; on the response, expiry and epochs are re-checked and the host ignores any result whose epochs changed (late replies change no UI state).
`invalidate()`: rejects the in-flight promise with [invalidated], drops the binding, sends `motif/release`, and is idempotent. A call already inside Chrome cannot be recalled (one scroll or one goBack, tens of ms); the check immediately before the call is the bound, and the result is reported rejected/[invalidated] so no UI treats it as success.

### 3.4 Worker validation (stateless, independent of the panel)
Order: sender (3.1) -> shape/version/whitelist -> `panelId`, epochs and `identityKey` equal the stored binding -> id not in the stored last-256 set (in `storage.session`) -> arm a local timer of `ttlMs` (the worker has no access to the panel's clock, so TTL is relative to receipt) and refuse to START if it fired -> live `tabs.get(boundTab)`: exists, `status === 'complete'`, window's active tab is the bound tab, URL origin equals the bound origin -> `permissions.contains` (revocation is detected here, not trusted from state) -> run the action on `frameIds:[0]` only. Any failure returns [rejected, code] and, for tab/permission/origin failures, also clears the binding.

### 3.5 Reject / failure codes and user text
`bad-version bad-id unknown-action invalid-times expired not-yet-valid stale-input-epoch stale-access-epoch identity-changed wrong-scope not-bound busy duplicate sender-rejected invalidated timeout page-loading page-changed tab-closed permission-missing unsupported-page no-history cannot-scroll`. Each has one plain-language line shown in the Browser controls card and announced (aria-live), e.g. unsupported-page: "Motif cannot control this page. Chrome's own pages, the Web Store, PDF viewer and local files cannot be controlled, and other sites need a helper to allow them first. You are back on your messages."

### 3.6 Invalidation events (each calls `port.invalidate()`, releases the binding and drops the scope to communication)
Tracking loss / stale / invalid frames, hidden panel (`visibilitychange`, `pagehide`, `freeze`), session fail-closed, mapping or profile change, calibration revalidation, identity change (3.7), bound tab activated away (`tabs.onActivated` in the panel's window), removed or replaced (`onRemoved`/`onReplaced`), navigation off the bound ORIGIN (`onUpdated` with `url`), `permissions.onRemoved`, camera ended, lock lost, panel unload. Same-origin in-page navigation cancels only the in-flight command and keeps the binding. Pause/Resume cancels the in-flight command and requires the existing fresh neutral but keeps the scope (Pause itself must stay reachable in both scopes).

### 3.7 Identity and no second login system
The panel runs the same `createSupabaseCareClient` as the web app (one SDK instance for this visible surface, awaited disposal before replacement, per the care contract). The extension does not copy credentials, profiles or tokens between origins: `chrome-extension://<id>` has its own localStorage, so a helper pairs the participant and the movements are calibrated (or restored from a profile saved) inside the panel. No credential is ever placed in a runtime message; messages carry only `identityKey` (participant id or `local`) and numeric epochs. Browser scope is available to roles `participant` and local use (`signed-out`/`unpaired`); never to `caregiver` or `revoked`. `accessKey = epoch + role + participant.id`, recomputed on every snapshot; ANY difference from the bound value invalidates. This also covers session expiry or poll failure, where `CareService` publishes a signed-out access WITHOUT bumping `epoch` (verified by reading `src/care/client.ts`). A new person at the camera needs the existing disarm and profile revalidation, not just a new account label.

## 4. Permissions (minimal manifest, generated by `extensions/motif/manifest.ts`)

| Item | Value | Why |
| --- | --- | --- |
| `permissions` | `sidePanel`, `scripting`, `storage` | panel, scroll injection, `storage.session` binding/replay memory |
| `optional_host_permissions` | `https://*/*`, `http://127.0.0.1/*`, `http://localhost/*` | only DECLARES what may be requested later; nothing is granted at install |
| `host_permissions` | none | nothing broad is held |
| `activeTab`, `tabs`, `<all_urls>`, `cookies`, `webRequest`, `nativeMessaging`, `debugger` | NOT requested | activeTab grants are temporary and gesture-bound; `tabs` shows a browsing-history warning. Consequence: a tab's URL is visible to Motif only for origins the helper already allowed, which doubles as the support test (URL absent = not allowed or restricted) |
| `content_security_policy.extension_pages` | `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; connect-src 'self' <exact care origin if configured>; img-src 'self' data: blob:` | wasm (V2); care origin built with `validatedCareOrigin`/`parseCareConfig`, never a key in HTML |
| `side_panel.default_path` / `action` | `sidepanel.html`, `setPanelBehavior({openPanelOnActionClick:true})` set by the worker on install | helper-assisted (re)open |
| `minimum_chrome_version` | 116 | `sidePanel.open` |
| `web_accessible_resources`, `externally_connectable`, `content_scripts` | absent | no web-page entry point |

Granting: a helper types or picks an origin in the helper-only "Allow a site" form (chips: Wikipedia, MDN, local demo page). The panel validates it (https, or http loopback; exact origin, no wildcard, no userinfo, not on the denylist of Web Store, Google account pages and other sign-in hosts) and calls `chrome.permissions.request({origins:[origin+'/*']})` inside that click handler. A gesture event can never trigger the request. The truth is always Chrome's grant (`permissions.contains`), re-checked by the worker before each action; Motif's list only filters what it offers. Helpers can revoke from the card (`permissions.remove`) or chrome://extensions. Restricted pages (chrome://, Web Store, new tab, PDF viewer, `file://` unless Chrome's own toggle is set, other extensions' pages) fail the support test and show the 3.5 explanation.

## 5. Return semantics
- Scan scopes: `communication` (phrases, request tiles, controls, plus a `browse` tile) and `browser` (exactly four tiles: Scroll down, Scroll up, Back, Return to messages). Pause is reachable in both through the existing mapping action. `browse` binds the active tab of the panel's window (fresh check, 3.2); on failure the scope does not change and the reason is shown.
- Return = host switches to the `communication` scope of the same page tree; the care client, snapshot, request list and statuses are never unmounted, so request status is preserved and polling continues. It runs even when no tab is bound, the permission is gone, or the page is unsupported (it needs no Chrome call). It is the first thing every invalidation does (automatic Return with a visible reason).
- Return reachability invariant: the browser tile list always contains Return and is exactly 4 tiles; scrolling to the end of the page or an error never removes it. Worst-case latency is one scan cycle of 4 tiles. Step-mode (Next/Select) reaches it with at most 3 Next.
- One event, one effect: `dispatchTarget(id)` is the only code path from a selected tile to an effect and returns exactly one of `{care}`, `{browser}`, `{local}`. Browser tiles never call the care client; care tiles never call the port (the port also checks scope, 3.3.4). Mode changes use the scanner restart which already requires fresh neutral.
- Participant correctness: the Return handler re-reads the live care snapshot; if its `accessKey` differs from the one at bind time the scope is already gone (3.6), so Return can only ever show the communication view of the CURRENT authorized participant, never a cached view of the previous one. Header text always names who is being controlled ("Alex" from the authorized pairing, or "This device, not paired").
- Active mappings display: the Browser controls card lists the four commands and which movement or switch triggers selection, reusing `describeMapping` text, plus current state (not allowed / ready / controlling <origin> / paused).
- Idle safety: 90 s of valid tracking in `browser` scope with no command returns to communication, so nobody is stranded in a mode.

## 6. Failure modes

| Failure | Result |
| --- | --- |
| Extension not installed / panel closed / minimized (hidden) | no tracking, no commands; helper reopens; local Motif unaffected |
| Camera/model error in panel | existing tracker error screens; no commands |
| Permission missing, revoked, restricted page | `browse` refused or binding cleared; Return still works; plain explanation |
| Tab switched, closed, navigated to other origin, page still loading | invalidate, unbind, drop to communication; no replay |
| Duplicate id, replay, expired command, future-dated command | rejected; no scroll |
| Old epoch (tracking loss, pause, mapping, re-arming) | rejected; fresh neutral required |
| Logout, expiry, revocation, pair, account switch, offline access wipe | invalidate + unbind + communication; browser scope blocked for caregiver/revoked |
| Worker suspended mid-session | binding/replay memory live in `storage.session`; the next message wakes it; a lost binding yields [not-bound] and the person re-selects Browse |
| Second panel/window | lock holder only; the other shows a notice and runs no tracker |
| Back with no history | [no-history], stays in browser scope |
| Page not scrollable / scroll handled by an inner container | [cannot-scroll], honest message, no repeat |
| Telemetry | blocked by `installOfflineGuard` and the manifest CSP (V4) |
| Page tries to message the worker | no listener for external or content-script senders; sender checks (3.1) |

## 7. Test plan

Automated (Vitest, jsdom, faked `chrome` object, injected clock, synthetic streams only, no real camera):
- protocol/port: every reject code incl. prototype-key action, NaN/Infinity times, ttl 0 and above max, future issuedAt, duplicate id after success AND after reject, epoch mismatch both kinds, busy, wrong scope, `invalidate()` during flight, late reply after invalidate, idempotent invalidate, unhandled-rejection free.
- sender identity (pure function + worker handler with fake `chrome.runtime`): wrong id, wrong origin, web-page URL, content-script shaped sender (`sender.tab` + page url), other extension page path, non-zero frameId, bound tab equal to sender tab, no listener registered for external/connect (manifest snapshot test).
- origins/permissions: https vs http loopback, userinfo, wildcard, trailing path, punycode lookalike, Web Store host, `file:`, `chrome:`, `about:`; `contains` false at action time clears binding; manifest snapshot (permissions exact, no `<all_urls>`/`tabs`/`activeTab`, CSP string includes wasm-unsafe-eval and the exact care origin only).
- tab events: active tab changes, `onUpdated` to other origin vs same origin, `onRemoved`, `onReplaced`, `permissions.onRemoved`, status loading, `windowId` mismatch.
- controller/identity (fake host): tracking loss, pause, hidden, mapping change, lock lost each drop scope and cancel in-flight; participant A command rejected after switching to B (epoch AND same-epoch-different-participant, and poll-failure wipe with unchanged epoch); caregiver and revoked roles cannot enter browser scope; queued A command never executes after B pairs; storage.session binding from A unusable by B's panelId.
- dispatch invariants: for every target id in both scopes, one selection yields at most one of care.sendRequest / port.execute (spy); long hold = one command; Return in tile list in every state; Return works with no binding and revoked permission; request tile sends exactly once after Return.
- UI (RTL): messages and aria-live text for each reject, helper-only form requires a click, no auto-permission request, narrow width (400 px) layout smoke.
- Integrated, after Agent 3 hooks: real `MotifSession` driven by the existing synthetic frame helpers (`session.test-support.ts`) -> select `browser:scroll-down` -> fake chrome sees one scroll; tracking loss mid-hold -> none.
- Machine browser probe (Chrome for Testing, built extension, fake camera, local tall page): panel boots, model loads, camera starts, assisted Space switch scans to Scroll -> the page's `scrollY` increases once, Back, Return -> request tiles enabled; closing the page that hosts the panel -> further commands impossible; second panel gets the lock notice. Stand-in for the gesture; labeled as such.
Human-pending (never claimed): U1-U4, real webcam gesture selecting Scroll, comfort, real Chrome side panel behavior across tab switches/minimize, camera prompt in the panel, true two-device acceptance with Agent 3, correct-participant Return with a real paired account, second-origin tracker rule.

## 8. Implementation chunks (each a small commit; tests before the next)
1. `protocol.ts` (types, codes, constants, validators) + `origins.ts` + tests.
2. `executor.ts` worker-side logic over an injected `ChromeLike` + sender check + tests (fake chrome).
3. `port.ts` `createBrowserCommandPort` + tests.
4. `controller.ts` (binding, tab/permission events, identity watcher, lock adapter, scope state, idle return) + `dispatch.ts` + tests; `host.ts` interface file.
5. `extensions/motif/` manifest builder, worker entry, `sidepanel.html`/entry, `vite.config.ts`, `.gitignore`; manifest snapshot test; confirm `npx vite build --config extensions/motif/vite.config.ts` works (no package.json change).
6. `BrowserControlsPanel` + `BrowserAccessProvider` + `ReaderExecutor` stub (fallback 2 interface only) + RTL tests.
7. `extensions/motif/scripts/probe.mjs` machine probe; record results.
8. Integration with Agent 3's hooks; real-session synthetic test; progress/human checklist.
Each chunk: relevant Vitest + `tsc --noEmit`; independent testing review after chunk 4 and after chunk 7; reasoning re-review if the design changes. Public assets: this worktree has none of `public/models`, `public/mediapipe`, `public/runtime-assets.json` (gitignored); chunk 5 needs `npm run setup:assets` approval or a copy from the main checkout.

## 9. Hooks proposed for Agent 3 (I do not edit these)
1. **Scan scope + routing in `MotifSession`**: `scope: 'communication' | 'browser'`, a `browse` control tile in communication (only when an adapter is attached), four targets `browser:scroll-up|scroll-down|back|return` (kind `'control'`) in browser scope, and `activate(id)` forwarding `browser:*` to `session.browserSink?.(id)` (one call, fire-and-forget). Works for both gesture and assisted Space input.
2. **`inputEpoch`**: `session.getInputEpoch()` plus `session.onFailClosed(cb)`; increment and call synchronously on tracking invalid/stale/hidden, pause/resume, stage change, mapping/profile change, disarm, calibration revalidation.
3. `session.returnToCommunication(): boolean` (switch scope, announce, return false if not possible).
4. **Care identity**: expose the single `CareClient` of the surface via React context (or a getter) so the controller reads `snapshot` and `watch`. Needed: `epoch` bumps on any sign-in/out, pair, expiry, revoke (already true) AND a stated rule that poll failure wipes access without a bump (I compensate with role + participant id, but please keep this documented). No new auth system: the interface I consume is exactly `CareClient.snapshot` / `watch`.
5. **Mount**: render `<BrowserAccessProvider>` and `<BrowserControlsPanel/>` from `src/features/browser-access` in `App` when `location.protocol === 'chrome-extension:'`; allow `extensions/motif/src/sidepanel.tsx` to reuse `main.tsx` logic (offline guard + care config) via an exported `bootstrap(root)`.
6. **Build glue**: root script `build:extension` (`vite build --config extensions/motif/vite.config.ts`), `dist-extension`/`extensions/motif/dist` ignored.
7. Participant UI must be usable at about 400 px width; request tiles must be scan targets reachable after Return.
8. Keep exporting `validatedCareOrigin`, `parseCareConfig`, `applyCareConnectPolicy` unchanged (manifest CSP uses them).

## 10. Open items and risks (carried to the reviewer)
Highest risk: U1/U2 (the side panel may not satisfy visibility or camera prompting; the fallback chain exists for that). Also: hook scope (1481-line session), per-origin local state means pairing and calibration are repeated inside the panel, tab URL visibility without `tabs`, branded Chrome automation limits, and the cross-origin second tracker.
