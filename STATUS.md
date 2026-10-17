# Motif build update

**Branch `ux-setup-flow`, slice 1 done (software):** the start screen now has one big **Get started** button. It turns the camera on and begins the rest check by itself. With a saved setup, **Continue** stays the main button and **Set up again** is the small one. Text on this screen is now at least 14px, and the old "repeats the rest check" wording is fixed.

**Checked (automated + browser, camera covered):** typecheck, build and 387 tests pass. QA broke the double-click and "left before camera started" protections on purpose and the tests caught it.

**Needs you (one check):** click **Get started** with the real camera. Your browser should ask for camera permission, then the 10-second rest check should start without another click. Tell me if it doesn't, or if the start screen feels unclear.

**Not checked:** the start screen at a 1280-wide window (the tool could not resize).

**Next:** slice 2 (pick a movement = start recording) and slice 3 (one approve screen). Nothing is pushed.
