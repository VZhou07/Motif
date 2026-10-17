# Motif build update

**Now:** the latest `main` is merged into `ethan-features` (local commits only; nothing is pushed). An independent test review of the merge is next.

**From your branch (C1):** a short main list, **Speak · Undo · Favourites · Quick · Needs · Pause · More**. Pick a group, then a phrase. **More** has Clear, Save to Favourites, Say again, speed, Practice and Recalibrate. Back and Pause are in every list; an open list returns to the main list after two quiet passes. Helpers can edit phrase groups during setup or while paused.

**From `main`:** one **Get started** button, click a movement, then **Approve and practice**. Your setup is saved automatically as "Last setup"; **Continue** reuses checks from the last hour. Close one eye ignores two-eye blinks. **Done, back to start screen**.

**Favourites:** once a movement is set up, confirmed favourites and phrase edits are kept on this device with Last setup straight away, and stay through a reload, back to start or Set up again. **Delete saved setup** removes them. Assisted input without a movement keeps them only until the page closes.

**Checked (automated):** typecheck PASS; 599 tests PASS; build PASS; 83/83 fake-camera browser checks PASS.

**Still needs a person:** real camera, comfort, beeps, whether groups are faster, Continue within and after an hour. See `ACCEPTANCE.md` and `UX_ACCEPTANCE.md`.

**Note:** someone added Supabase packages to `package.json`; left untouched.
