# Motif build update

I am Agent 3, building the Supabase accounts and request foundation on the separate `feature/request-relay` branch. It now has caregiver accounts, private groups, participant invitations, request updates and permission tests. The other three teammates own participant screens, the caregiver dashboard and browser controls.

Independent tests passed: 455 tests, typecheck and configured browser privacy checks. The production build is being rechecked after installing the local camera runtime files. I am preparing one tested starting commit that includes the committed main changes, so everyone can build against the same API.

Supabase does not need a GitHub link. Each laptop needs the exact `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` variables. The shared project still needs its SQL migration, anonymous sign-in and private demo caregiver accounts; see `docs/supabase-setup.md`.

The participant/dashboard screens and browser companion are not connected yet. Hosted delivery and real-person camera checks remain pending. Teammate checkouts and the separate head/mouth preview at port 5187 are untouched. Nothing pushed.

