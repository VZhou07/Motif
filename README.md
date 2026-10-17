# Motif

Motif is a browser app that lets a person communicate with movements they can comfortably repeat: an eyebrow raise, opening the mouth, a small head turn, or anything else the camera can measure. It learns each movement from that person's own rest and practice, checks it with separate attempts and an everyday-activity check, and only then lets it pick phrases, build a message and speak it.

It is a hackathon prototype for assistive interaction. **It is not a medical device, does not diagnose anything and does not detect emergencies.**

## What it does

- **Rest and one movement.** Ten seconds of rest, three practice attempts, two separate check attempts and ten seconds of everyday activity. After that you confirm the movement is comfortable and approve the controls.
- **Communication.** A short main list is highlighted one item at a time: Speak, Undo, one tile per phrase group (Favourites, Quick, Needs), Pause and More. A held movement opens a group; inside it, a held movement adds the highlighted phrase to the message and goes back to the main list. **More** holds Clear, Save message to Favourites, Say again, Slower/Faster, Practice, Change controls and Recalibrate. Back and Pause are in every list, and an open list goes back to the main list by itself after two full passes with no selection.
- **Phrases and Favourites.** A helper can add, rename, reorder and remove groups and phrases during setup, or while communication is paused (up to 6 groups including Favourites, 12 phrases each). **Save message to Favourites** copies the current message into Favourites after a scanned confirmation.
- **Up to four movements.** For example, one selects and one moves to the next item (no timer). Each new movement is checked so it does not get in the way of the others.
- **Saved profiles (opt-in).** Save the setup on this computer and restore it later. Restoring repeats the rest check and re-checks every movement before anything works.
- **Observations and suggestions.** Plain counts (for example "4 of 4 required checks passed"), effort ratings, "a movement is tiring", and suggested controls you can accept, change or ignore.
- **Find my movements.** Move freely for 20 seconds and Motif suggests movements it noticed. A suggestion is only a starting point: it goes through the same practice and checks.
- **Assisted input.** A clearly labelled Space-bar switch (or mouse/keyboard for a helper) for people who cannot use a face movement yet.

## Requirements

- Desktop Chrome or Edge with a webcam, opened on `localhost` or HTTPS. English only. One person in view.
- For development: Node 22.12 or newer within 22.x, or Node 24 (Vitest does not support Node 23). Tested with Node 24.

## Setup

```bash
npm ci
npm run setup:assets   # downloads the public MediaPipe face model and copies the matching WASM into public/ (no user data is sent)
```

## Run

```bash
npm run dev            # http://127.0.0.1:5173
npm run build          # checks the local model assets, typechecks and builds dist/
npm run preview        # serves the production build on 127.0.0.1
```

## Checks

```bash
npx tsc --noEmit                 # typecheck
npx vitest run                   # unit, session and screen tests (synthetic numeric streams; no camera)
npm run build
node scripts/browser-check.mjs   # after build: headless browser checks with Chrome's synthetic fake camera
```

The browser check never opens a real webcam. It uses Chrome or Edge if installed, otherwise Playwright's bundled Chromium (`npx playwright install chromium`). Set `CHECK_DETAIL=all` to list every failing element. The fake camera shows no face, so screens after calibration are checked for behaviour and accessible names by the automated session/screen tests, for colour and text size by a stylesheet test, and for real-world contrast, focus and layout only by the manual checklist in [ACCEPTANCE.md](ACCEPTANCE.md).

## Using it

1. Start the camera (a helper may click). Keep only the person being set up in view.
2. Rest for ten seconds, then pick a movement from the list, or choose **Not sure? Find my movements**.
3. Follow **Rest** (5 seconds) then **Action** (5 seconds, hold your movement). The camera overlay shows the live reading and why an attempt is rejected. Then the separate checks and ten seconds of everyday activity.
4. Say whether the movement is comfortable, choose controls and approve them. Practice first: nothing is spoken in practice.
5. Communicate. Open a group, pick a phrase, then Speak. Undo removes the last phrase; Clear (in More) empties the message and cannot be undone. To stop for a while, select **Pause** (in every list); the same movement resumes after a short rest, from the start of the same list.
6. Helpers can jump to any group with the shortcut buttons above the tiles, and edit phrases under **Edit phrases (helper)** while paused. After a change, scanning resumes from the main list.

Keyboard: in assisted mode Space is the switch. Use **Enter** to press a focused button; Tab moves focus and every control shows a focus outline.

## Privacy

- The camera image is processed on this device by the bundled MediaPipe model. No video, image or measurement leaves the device, and nothing is sent to any server (there is no backend).
- MediaPipe's face-landmarker library has built-in usage logging that would send to Google every minute and when the camera stops (from reading the library code, it holds performance counters, not images; the content was not observed). Motif blocks it: the app refuses every `fetch` and beacon to another site before it reaches the network, and a Content-Security-Policy refuses outside connections (fetch, XHR, WebSocket) and images as a second layer. Scripts, styles and fonts are not restricted by that policy; the app loads none from outside. Builds before 2026-10-17 (commit `b070ba2`) did not block the logging.
- Nothing is stored unless you choose **Save on this device**. A saved profile holds only movement settings (numbers relative to your face measurements), controls, phrase groups including Favourites, and scan speed. It never holds video, images, messages or what was spoken. Favourites are kept only because a person chose to save them, and until a profile is saved they disappear when the page closes. **Delete** and **Delete all saved profiles** remove it.
- Profiles saved by this version (phrase groups, profile version 2) cannot be read by older copies of Motif: an older copy shows them as unreadable and leaves them untouched. Older profiles open here, with their phrases in one group called Phrases (a phrase saved twice appears once). If an older copy later saves a profile with the same name, both are listed here; delete the one you do not want.
- Speech uses only voices the browser marks as local. Without one, the message stays on screen and Motif says so; it never uses a remote voice.

## Limits (please read)

- **Not yet tried by a person with a real camera.** All results so far come from automated tests with synthetic signals and a fake test camera. Real webcam behaviour, comfort, speech audibility and hands-free use still need a person (see [ACCEPTANCE.md](ACCEPTANCE.md)).
- **Counts are observations, not accuracy.** "4 of 4 required checks passed" describes this session's checks, which had to pass. It does not predict future reliability.
- **Lighting and posture changes are not adapted to.** Thresholds never change silently. After a big change in lighting, seating or camera position, recalibrate (or restore a profile, which repeats the rest check).
- **No automatic fatigue detection.** Use Pause, Slower scanning or "A movement is tiring" to change controls.
- **Head-direction labels** (turn left/right, chin up/down, tilt) are derived from the face model's geometry and still need confirmation with a real camera.
- **Setup may need a helper.** Camera permission and the first movement choice can need a mouse or keyboard. After a movement is approved, everything else works with that movement alone.
- Desktop Chrome/Edge only; no mobile or Safari support. English phrases only. One person in view (two faces pause everything).
