# Motif build update

**Branch `ux-landing` (includes the latest `main`):**
- A simpler start screen: one **Get started** button, or **Continue with your last setup** if one is saved.
- Setup is **Get started**, click a movement, **Approve and practice**. You can rename the movement on the approve screen.
- With one movement, **Choose another movement** on the confirm screen goes back to picking a movement.
- From `main`: **Close left/right eye** means one eye (a two-eye blink should not fire it); movements learn from a clear hold of about 0.6 s; **Done, back to start screen**; Continue reuses only checks from the last hour.

**Checked (automated):** see `progress.md` for the latest test, typecheck and build results.

**Needs you (real camera):** Get started starts the rest check by itself; clicking a movement starts recording; the approve screen is clear; blink vs one-eye; Continue within and after an hour.

Camera processing stays on this computer. Nothing is pushed.
