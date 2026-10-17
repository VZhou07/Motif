# Motif build update

**Branch `ux-setup-flow`, slices 1 and 2 done (software):** one **Get started** button starts the camera and the rest check by itself. After your movement passes its checks, one screen shows what will turn on, with **Approve and practice**. The mapping and confirm screens are skipped for a first movement. From launch to practice a new user now needs 4 selections instead of 8.

**Checked (automated + browser, camera covered):** typecheck, build and 412 tests pass. QA broke key protections on purpose; the important ones were caught.

**Needs you (two checks):**
1. Click **Get started** with the real camera. It should ask for permission, then start the rest check with no further click.
2. After a movement passes, read the approve screen. Does it make clear what Approve turns on?

**Not checked:** a 1280-wide window.

**Now building:** slice 3 (click a movement to record it; rename it on the approve screen). Nothing is pushed.
