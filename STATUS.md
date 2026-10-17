# Motif build update

**Changed for you:** calibration now alternates **5 seconds Rest / 5 seconds Action** (no separate Return to rest). A low beep marks Rest, a higher beep marks Action (checkbox on the camera panel). Diagnostics sit **under** the camera so they do not cover your face. If Rest was already as strong as Action (for example an open mouth during Rest), it says so in plain language.

**Checked (automated):** typecheck PASS; 353 tests PASS; production build PASS; 67/67 fake-camera browser checks PASS. Independent review required a pending-at-boundary test, then passed. Shared Rest that starts while you are still relaxing is no longer rejected just because the first frame is not rest yet.

The approved communication features, movement discovery, multiple movements, saved profiles and assisted Space-bar input remain available. Camera processing stays on this computer, and outside usage reporting is blocked.

**Still needs a person:** real face tracking, whether this rhythm is comfortable, whether the beeps are audible, and hands-free use. The camera stayed covered during automated checks. See `ACCEPTANCE.md` 3.2 and 3.6.

Refresh the app (`npm run dev`) and try calibration again. Look at the overlay if it still fails. Actual success is not claimed. Nothing has been pushed.
