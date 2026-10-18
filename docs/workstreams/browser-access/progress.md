# Browser access (Agent 4) - progress and handoff

Checkpoint: C4 on `feature/browser-access`, worktree `/Users/vivianyang/Motif-browser-access`, base `1e94ede`. Never push. Owner: Agent 4 (this workstream only). Owned files: `extensions/motif/**`, `src/features/browser-access/**`, this folder.

## State
- Reasoning revision 1 written (`reasoning.md`). State: `planned` - awaiting independent reasoning review. No implementation exists; do not start code until a reviewer records an explicit verdict here.
- Last passing checkpoint commit: none for this workstream. Code changes: none. Uncommitted work: none after the design commit.
- Running processes: none (probe browsers closed). Other worktrees untouched.

## Review record
| Revision | Reviewer | Verdict | Findings and fixes |
| --- | --- | --- | --- |
| 1 | pending | pending | - |

## Evidence so far (scratchpad probes, not repository code)
Chrome for Testing 153.0.8010.12 (Playwright cache `chromium-1243`; Playwright 1.64.1 in node_modules expects revision 1248 which is not installed, so the probe used `executablePath` with 1243). Findings V1-V6 and unverified U1-U5 are tabulated in `reasoning.md` section 2. In short: extension page runs the pinned MediaPipe 1.1.1 with local model/WASM under `wasm-unsafe-eval`; MediaPipe telemetry was refused by `connect-src 'self'`; scripting scroll and `tabs.goBack` work; the real side panel, its visibility semantics and camera prompting are not yet observed. The real webcam was not opened.

## Environment notes
- Installed here: `/Applications/Google Chrome.app` 155.0.8059.84 (branded; the `--load-extension` switch is not usable there), Chrome for Testing 153 in the Playwright cache. Nothing installed by this workstream.
- This worktree has no `public/models`, `public/mediapipe`, `public/runtime-assets.json` (gitignored). The main checkout has them; building the extension needs `npm run setup:assets` (network approval) or a copy. `node_modules` is a symlink; do not run npm install or edit package.json/lockfile.

## Next actions (ordered)
1. Independent reviewer reads the five project documents, the canonical skill, `reasoning.md` revision 1, `src/care/browser-contract.ts`, `src/care/client.ts` (epoch semantics) and records a verdict above. Resolve blockers; any substantive change gets re-reviewed.
2. Agent 3 answers section 9 hooks (scope/routing, inputEpoch, returnToCommunication, care client access, mount, build script). Chunks 1-4 do not depend on them and may start after approval.
3. Implement chunks in order (reasoning section 8), committing each small verified chunk with a one-line subject.
4. Independent testing review after chunk 4 and chunk 7; then integration evidence with Agent 3.

## Human-pending (never claim)
Load the built extension via chrome://extensions > Developer mode > Load unpacked (Chrome 155); open the side panel with the toolbar icon; observe camera prompt in the panel; confirm the panel keeps tracking across tab switches and stops when minimized/closed; allow one site through the helper form; real gesture selects Scroll, Back works, Return shows the correct paired participant, and a request sends; no second tracker open in the localhost web app.
