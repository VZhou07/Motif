# Motif build update

The shared starting point for the team is ready. I am Agent 3, building caregiver accounts and the request foundation on the `feature/request-relay` branch. It now has caregiver sign-in, private groups, participant invitations, request updates, permission tests, and the frozen list of browser commands Agent 4 needs. The committed changes from `main` are merged in, so everyone builds on the same code.

**Start the other three agents from the tip of the `feature/request-relay` branch** (verified source commit `2055e1c`; later commits only add these notes). On that code: 496 tests pass, the typecheck passes, and the production build passes. Nothing has been pushed.

What is being built next: the participant request screen, the caregiver dashboard, and the browser companion, each by its own teammate in its own copy of the project. I then connect them and add the role-aware pages.

What remains untested: the shared Supabase project still needs its database setup, sign-in and demo caregiver accounts on a laptop (see `docs/supabase-setup.md`), so no request has travelled between two real devices yet. The browser privacy check has not been rerun on the newest commit. Camera behaviour with a real person is still untested because the camera is covered.
**Branch `ux-landing` (includes the latest `main`):**
- A simpler start screen: one **Get started** button, or **Continue with your last setup** if one is saved.
- Setup is **Get started**, click a movement, **Approve and practice**. You can rename the movement on the approve screen.
- With one movement, **Choose another movement** on the confirm screen goes back to picking a movement.
- From `main`: **Close left/right eye** means one eye (a two-eye blink should not fire it); movements learn from a clear hold of about 0.6 s; **Done, back to start screen**; Continue reuses only checks from the last hour.

**Checked (automated):** see `progress.md` for the latest test, typecheck and build results.

**Needs you (real camera):** Get started starts the rest check by itself; clicking a movement starts recording; the approve screen is clear; blink vs one-eye; Continue within and after an hour.

Camera processing stays on this computer. Nothing is pushed.
