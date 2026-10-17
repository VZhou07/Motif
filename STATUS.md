# Motif build update

**Branch `staging`:** all four open pull requests merged on top of `main`, in this order: #7 `feature/request-relay` (accounts and request foundation), #9 `feature/participant-requests`, #10 `feature/caregiver-dashboard`, #8 `ethan-features` (grouped phrases and Favourites). Local only; nothing is pushed.

**What works:** the grouped phrase menu (**Speak · Undo · Favourites · Quick · Needs · Pause · More**), Favourites kept with Last setup, and the caregiver dashboard at `#/caregiver` (needs Supabase settings in `.env.local`; see `docs/supabase-setup.md`).

**Not connected yet:** the person's pairing and request buttons are merged but not wired into the communication screen (steps in `docs/workstreams/participant-requests/integration.md`). The browser companion has not been built.

**Checked (automated):** typecheck PASS; 857 tests PASS; production build PASS; 83/83 fake-camera browser checks PASS. An independent tester re-ran all of these and passed the branch.

**Untested:** the real Supabase project, two real devices, and the camera with a real person (camera covered).
