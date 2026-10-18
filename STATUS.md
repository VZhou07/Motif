# Motif build update

**Branch `ux-simplify` (merged with `origin/main`):** the setup is one flow with a single progress bar, click-to-record, one approve screen, and Recalibrate / A movement is tiring moved inside Helper or Change controls. The talking screen shows the message on top (**Speak**, **Undo**, **Say it again**), the 6 phrases as large tiles, and only **Pause** and **Helper** underneath. Phrase groups and Favourites are built but hidden for now (one setting turns them back on). Helper holds the controls, scan speed, Clear (asks first), Save to Favourites, phrase groups, Edit phrases and camera details. Clear and Recalibrate ask before they act. A **Movement seen** light shows on the right.

**Also from `main`:** Favourites kept with Last setup, and the caregiver dashboard at `#/caregiver` (needs Supabase settings in `.env.local`; see `docs/supabase-setup.md`). The person's pairing and request buttons are merged but not wired into the talking screen yet (`docs/workstreams/participant-requests/integration.md`).

**Checked (automated):** see `progress.md` for the latest test, typecheck and build results.

**Needs you (real camera):** Get started starts the rest check by itself; clicking a movement starts recording; the approve screen is clear; blink vs one-eye; Continue within and after an hour; on the talking screen, whether the Movement seen light matches your movement and scanning through Favourites, Helper and Clear feels right.

**Untested:** the real Supabase project, two real devices, and the camera with a real person (camera covered).
