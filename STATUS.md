# Motif build update

**Changed:** calibration now follows a steady rhythm: 3 seconds to get ready, 3 seconds to make and hold your movement, then 3 seconds to relax. The screen previews what comes next. I fixed an extra prompt between attempts and made interrupted attempts restart their countdown clearly.

**Checked:** 294 automated tests, the production build and 67 browser checks pass. Independent review found no blocking issues. Tests include delayed reactions, lost tracking and accidental movements.

The approved communication features, movement discovery, multiple movements, saved profiles and assisted Space-bar input remain available. Camera processing stays on this computer, and outside usage reporting is blocked.

**Still needs a person:** real face tracking, the comfort of the new rhythm, audible prompts and hands-free use. The camera stayed covered during automated checks. See `ACCEPTANCE.md` for what to try and `README.md` to run it.

The earlier overall build remains paused; this timing fix is finished in software. Nothing has been pushed.
