# Motif build update

**Fixed:** calibration was rejecting small changes in your relaxed face and judging gradual head relaxation too early. It now allows a small amount of personal rest variation and checks the settled part of your return. It still rejects a movement that stays substantially held.

**Checked:** the new tests first reproduced your exact error. All 321 tests, the production build and 67 browser checks now pass. Independent review also checked deliberately broken alternatives. Tests cover natural rest variation, gradual relaxation, accidental movements and full calibration through communication.

The approved communication features, movement discovery, multiple movements, saved profiles and assisted Space-bar input remain available. Camera processing stays on this computer, and outside usage reporting is blocked.

**Still needs a person:** real face tracking, the comfort of the new rhythm, audible prompts and hands-free use. The camera stayed covered during automated checks. See `ACCEPTANCE.md` for what to try and `README.md` to run it.

Refresh the app and run calibration again. Actual success and comfort with your camera still need checking. The earlier overall build remains paused. Nothing has been pushed.
