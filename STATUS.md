# Motif build update

**Branch `ux-setup-flow` is ready for you to try (software done).** Setup is now: **Get started**, click a movement, **Approve and practice**. That is 3 clicks plus Finish practice, down from 8. You can rename the movement on the approve screen.

**Checked (automated + browser, camera covered):** typecheck, build and 431 tests pass. QA broke key protections on purpose and the tests caught them.

**Needs you (3 checks, real camera):**
1. Click **Get started**. It should ask for camera permission, then start the rest check by itself.
2. Click a movement tile. Recording should start right away (no Record button).
3. On the approve screen, type a name and approve. Is it clear what Approve turns on?

**Not checked:** a 1280-wide window.

**Also new (branch `ux-landing`):** a simpler start screen, and a **How long to hold** choice when picking a movement. Closing an eye defaults to a 0.8 s hold, so normal blinks do not click.

**Also check:** set up **Close left eye (hold)** with Auto. Blink normally for a minute: nothing should be selected. Close your eye on purpose for about a second: it should select.

**Next:** `ux-comm-screen` (message bar, Undo, Repeat, Helper panel). Nothing is pushed.
