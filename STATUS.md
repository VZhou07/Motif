# Motif build update

**Changed for you:** **Close left/right eye** now means one eye, not a two-eye blink. A blink should not fire that control. Other movements no longer need to stay posed for the whole 5-second Action; a clear hold of about **0.6 seconds** is enough to learn them. Open mouth still works as before.

**Checked (automated):** typecheck PASS; 364 tests PASS; production build PASS. Independent review required tests for a twitch that looks like a hold and for too-sparse camera frames, then passed. Fake-camera browser checks were 67/67 on the first review pass.

The approved communication features, movement discovery, multiple movements, saved profiles and assisted Space-bar input remain available. Camera processing stays on this computer, and outside usage reporting is blocked. Saved profiles from before this change will ask you to set up again (the eye measurements changed).

**Still needs a person:** real face tracking, whether a blink is ignored, whether eyebrows/head/lips work with a short hold, comfort, beeps, and hands-free use. The camera stayed covered during automated checks. See `ACCEPTANCE.md` 3.2 and 3.6.

Refresh the app (`npm run dev`) and try calibration again. Actual success is not claimed. Nothing has been pushed.
