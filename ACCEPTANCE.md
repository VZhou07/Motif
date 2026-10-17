# Motif manual acceptance checklist

**Nothing in this checklist has been observed yet.** The build was done with the laptop camera covered; every result so far is from automated tests with synthetic signals and Chrome's fake test camera. A person with a real webcam fills in each row.

For each item record: **Observed** (what actually happened), **Pass/Fail**, **Date**, **Browser + version**, **Device/camera**. Do not mark an item as passed unless you saw it.

Setup before starting: `npm ci`, `npm run setup:assets`, `npm run build`, `npm run preview` (or `npm run dev`), desktop Chrome or Edge, good even lighting, one person in view. Open the browser's DevTools Network and Application tabs for the privacy items.

## W2 — Camera and live values

| # | Steps | Expected | Observed | Pass/Fail | Date | Browser | Device |
|---|---|---|---|---|---|---|---|
| 2.1 | Click Start camera; allow permission. | "Live · local", mirrored preview, "One face in view". | | | | | |
| 2.2 | Open "Movement signal dashboard"; raise your **left** eyebrow, then the right. | "Left outer eyebrow" rises for your own left side (not the mirror image's). | | | | | |
| 2.3 | Turn your head toward your left, then right; chin down/up; tilt toward right shoulder. | Head turning +/−, tilting up/down and sideways change sign as labelled. | | | | | |
| 2.4 | Cover the camera, then bring a second person into view. | "Looking for a clear face", then "More than one face in view — controls wait". | | | | | |
| 2.5 | Stop camera; Retry. | Camera turns off and on cleanly. | | | | | |

## W3 — Rest and one movement

| # | Steps | Expected | Observed | Pass/Fail | Date | Browser | Device |
|---|---|---|---|---|---|---|---|
| 3.1 | Start the rest check and rest 10 s. | Progress fills only while the face is tracked; looking away restarts it. | | | | | |
| 3.2 | Pick a comfortable movement; follow Rest / Action three times. Stay relaxed during Rest; make and hold the movement during Action. Watch the camera overlay (live reading, rest limit, why an attempt stops). Listen for a low beep on Rest and a higher beep on Action (mute on the camera panel). | Each Rest and Action lasts 5 tracked seconds with no extra Return-to-rest step. The next cue is previewed. Three attempts recorded; a lost face restarts a full Rest. Overlay shows real measurements, not a fake accuracy score. | | | | | |
| 3.3 | Do the two separate checks, then 10 s of everyday activity (talk, look around). | Both checks pass with one recognition each; 0 accidental selections reported with the armed seconds. | | | | | |
| 3.4 | Repeat with a very small movement. | Honest rejection ("overlaps resting variation") with retry / another movement / assisted options. | | | | | |
| 3.5 | Say whether it is comfortable ("comfortable and easy" or "takes effort"). | Choice is accepted by the movement itself or a button. | | | | | |
| 3.6 | In separate runs try a comfortable brow, mouth or head movement. Relax naturally between attempts rather than trying to reproduce exactly the same facial reading. | Small changes in relaxed position do not automatically fail training; gradual relaxation has time to settle. A movement that remains substantially held still fails. Separate checks and the everyday check must pass before approval. | | | | | |

## W4/W5 — Communication with one movement

| # | Steps | Expected | Observed | Pass/Fail | Date | Browser | Device |
|---|---|---|---|---|---|---|---|
| 4.1 | Choose controls and approve **using only the movement**. | Approval needs the explicit "Approve these controls" step. | | | | | |
| 4.2 | In practice, select phrases; then Finish practice. | Practice never speaks. | | | | | |
| 4.3 | Select two phrases, then Speak. | Message builds in order; it is spoken by a local voice and stays on screen. | | | | | |
| 4.4 | Hold the movement as the highlight moves to the next item. | The item highlighted when the hold began is selected (no skip). | | | | | |
| 4.5 | Select Pause; rest; make the movement. | Pause stops scanning; the movement resumes without selecting anything. | | | | | |
| 4.6 | Slower / Faster scanning. | Scan time changes by 0.5 s within 1–6 s. | | | | | |
| 4.7 | Turn away mid-hold; hide the tab; come back. | Nothing is selected; selections need a fresh rest first. | | | | | |
| 4.8 | Recalibrate → Keep current setup; then Recalibrate → full new setup. | Keep returns safely; a new movement replaces the old one only after approval. | | | | | |
| 4.9 | Speech audibility: speak a message at normal volume. | Clearly audible to a listener 2 m away. | | | | | |

## C1 — Grouped phrases and Favourites

| # | Steps | Expected | Observed | Pass/Fail | Date | Browser | Device |
|---|---|---|---|---|---|---|---|
| C1.1 | With one movement and automatic scanning, time how long it takes to add "Please help me" and Speak it. | Faster and less tiring than one long list; note the seconds. | | | | | |
| C1.2 | With one movement, time reaching Recalibrate (main list → More → Recalibrate). | Reachable with the movement alone; note the seconds. | | | | | |
| C1.3 | Open a group and do nothing. | After two full passes it goes back to the main list; say whether that feels too fast or too slow. | | | | | |
| C1.4 | Select Pause from inside a group and inside More; resume with the movement. | Pauses at once; resumes in the same list from its first item, without selecting. | | | | | |
| C1.5 | Build a message, More → Save message to Favourites → Save. Then Favourites. | The message appears in Favourites; only the select movement can confirm. | | | | | |
| C1.6 | Undo, then Say again after speaking. | Undo removes only the last phrase; Say again repeats the last spoken message. | | | | | |
| C1.7 | A helper edits groups during setup and while paused. | Changes show on the board; Resume after a change starts from the main list. | | | | | |
| C1.8 | Save a profile with favourites; reload; restore it. | Favourites come back; DevTools Application shows no message or spoken text stored. | | | | | |
| C1.9 | Do the default groups (Quick, Needs) make sense to the person? | Note what they would change. | | | | | |

## W6 — Two or more movements

| # | Steps | Expected | Observed | Pass/Fail | Date | Browser | Device |
|---|---|---|---|---|---|---|---|
| 6.1 | Add a movement (e.g. open mouth). | Two new checks plus a cross-check of the first movement, then the everyday check. | | | | | |
| 6.2 | Approve "selects / moves next". | Highlight moves only with the next movement; no timer. | | | | | |
| 6.3 | Make both movements at once. | Nothing is selected. | | | | | |
| 6.4 | Rest for over a minute in step mode. | Scanning becomes automatic with a visible note; select still works. | | | | | |
| 6.5 | Change controls → Keep current; Change controls → another option → Approve; Use previous controls. | Nothing changes without approval; previous controls return after approval. | | | | | |

## W7a — Saved profiles

| # | Steps | Expected | Observed | Pass/Fail | Date | Browser | Device |
|---|---|---|---|---|---|---|---|
| 7a.1 | Save on this device with a name; check DevTools → Application → Local Storage. | Only `motif.profiles` with movement numbers, controls, phrases, scan speed; no images or messages. | | | | | |
| 7a.2 | Reload; Restore the profile. | Rest check, a re-check of each movement and the everyday check run before "Approve these controls". | | | | | |
| 7a.3 | Restore after moving the camera or changing lighting a lot. | Either passes the re-checks or fails honestly ("does not fit today's rest"). | | | | | |
| 7a.4 | Delete one profile; Delete all. | Each asks for confirmation; removed from Local Storage. | | | | | |

## W7b — Observations and suggestions

| # | Steps | Expected | Observed | Pass/Fail | Date | Browser | Device |
|---|---|---|---|---|---|---|---|
| 7b.1 | Open "Setup evidence" after some use. | Per movement: checks "N of N", accidental activations with seconds, practice strength, effort, completed/unfinished holds. No percentages. | | | | | |
| 7b.2 | With two movements, choose "A movement is tiring" and name one. | Suggested controls leave it unused; nothing changes until approved. | | | | | |
| 7b.3 | Use "Helper: set controls by hand". | Invalid combinations are explained; valid ones go to the approval step. | | | | | |

## W7c — Find my movements

| # | Steps | Expected | Observed | Pass/Fail | Date | Browser | Device |
|---|---|---|---|---|---|---|---|
| 7c.1 | Choose "Not sure? Find my movements"; make two different movements a few times each, resting between. | Up to four plain-language suggestions with "seen N times". | | | | | |
| 7c.2 | Choose a suggestion. | The normal practice and checks start; nothing works before approval. | | | | | |
| 7c.3 | Explore while blinking normally and shifting in the chair. | Blinks and posture shifts are not suggested. | | | | | |

## W8 — Demo and accessibility

| # | Steps | Expected | Observed | Pass/Fail | Date | Browser | Device |
|---|---|---|---|---|---|---|---|
| 8.1 | Person A sets up an eyebrow movement and saves. Person B sets up mouth + cheek and saves. Reload; each restores their own profile. | Both work without code changes; A's movement does nothing in B's setup and vice versa. | | | | | |
| 8.2 | Person B switches to a one-movement mapping (mouth only). | Automatic scanning with the mouth works. | | | | | |
| 8.3 | Deny camera permission; unplug the camera; open in a browser without camera support. | Each explains what happened; assisted input stays available. | | | | | |
| 8.4 | Use only assisted Space and Enter/Tab with no face movement. | Phrases, Speak and Pause work; focus outline visible on every control. | | | | | |
| 8.5 | Dim the room lights / turn on a lamp behind the person during use. | No selections without a deliberate hold; recalibrate if the movement stops working. | | | | | |
| 8.6 | Use for 10 minutes. | Note any fatigue; Pause, Slower and "A movement is tiring" are enough to continue. | | | | | |
| 8.7 | Turn on the OS "reduce motion" setting; check high-contrast readability at arm's length. | No animations; text readable. | | | | | |
| 8.8 | DevTools Network during a full session longer than two minutes, including Stop camera. | No requests leave the device (only the local server); MediaPipe's usage log is never sent. | | | | | |
| 8.9 | Browser without a local voice. | Message stays on screen with an explanation; nothing is spoken remotely. | | | | | |

## Evidence map (plan W8 item → automated evidence → manual row)

| W8 item | Automated evidence | Manual row | Kind |
|---|---|---|---|
| Demo Person A and B without code changes | `src/app/hardening.test.ts` "two people with different movements save, restore and communicate…" | 8.1 | both |
| One-gesture fallback | same test (mouth-only mapping); `session.test.ts` "a one-movement mapping ignores the unmapped movement…" | 8.2 | both |
| Zero gestures | same test (assisted Space); browser check "assisted Space opens a group and adds its highlighted phrase" | 8.4 | both |
| Permission errors | browser checks "camera permission refused", "camera blocked by the browser is explained", "no camera device", "camera in use elsewhere", "camera API unsupported", "model file blocked", "model runtime blocked" | 8.3 | both |
| Nothing leaves the device | browser checks "usage logging and other outside requests are blocked inside the app", "no requests leave this device", "no Content-Security-Policy refusals were needed"; `src/tracker/offline.test.ts` | 8.8 | both |
| Tracking loss | `hardening.test.ts` "flickering tracking never acts…"; `session.test.ts` "communication safety" tests | 4.7, 2.4 | both |
| Noisy lighting | `hardening.test.ts` light/medium jitter, heavy wander rejected, "a lighting shift after calibration is not adapted to…" | 8.5, 7a.3 | both |
| Reload | browser checks "reload starts clean", "a corrupted saved payload is reported", "a restored profile stays unarmed…" | 7a.2 | both |
| Speech absence | browser check "no local voice: message stays on screen…"; `session.test.ts` "keeps text visible and explains when no local voice is available" | 8.9, 4.9 | both |
| Comfort/fatigue | `session.scoring.test.ts` effort and tiring tests; `session.test.ts` comfort/record-again/another-movement paths | 3.5, 8.6, 7b.2 | both |
| Keyboard focus | browser checks "keyboard focus is visible at every Tab stop", "Tab order completes without a trap" | 8.4 | both |
| Contrast and text size | browser checks "contrast AA on every visible text", "text at least 12 px", "buttons at least 44 × 44 px", "scan highlight outline reaches 3:1" | 8.7 | both |
| Reduced motion | browser check "reduced motion disables transitions" | 8.7 | both |
| Grouped scanning and Favourites (C1) | `session.levels.test.ts`, `session.composer.test.ts`, `navigation.test.ts`, `vocabulary.test.ts`, `Phrases.test.tsx`; profile versions in `profiles.test.ts`; browser checks "a confirmed favourite appears on the main list and is not written to browser storage" and the More / confirm / Needs / paused-editor audits | C1.1–C1.9 | both |
| Accessible names | `App.test.tsx` "gives every control on each screen an accessible name…" | 8.4 | automated |
| Supported environment and limitations | [README.md](README.md) "Requirements" and "Limits" | — | documentation |
