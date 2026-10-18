# Motif build update

**Branch `ux-simplify` (merged with `origin/main`):** the setup is one flow with a single progress bar, click-to-record, one approve screen, and Recalibrate / A movement is tiring moved inside Helper or Change controls. The talking screen shows the message on top (**Play**, **Undo**, **Say it again**), the 6 phrases as large tiles, and only **Pause**, **Favourites** and **Helper** (plus **Ask caregiver** when paired) underneath. Phrase groups are built but hidden for now (one setting turns them back on). A **Favourites** button sits beside Helper; save a message to it from Helper. Helper holds the controls, scan speed, Clear (asks first), Save to Favourites, phrase groups, Edit phrases and camera details. Clear and Recalibrate ask before they act. A **Movement seen** light shows on the right.

**Also from `main`:** Favourites kept with Last setup, and the caregiver dashboard at `#/caregiver` (needs Supabase settings in `.env.local`; see `docs/supabase-setup.md`). When a caregiver is paired, an **Ask caregiver** button appears beside Helper (requests), and pairing sits in Helper.

**Checked (automated):** see `progress.md` for the latest test, typecheck and build results.

**Practice page removed:** approving now goes straight to the talking screen, and the button says **Play** instead of Speak. "Use previous" now lives in Change controls.

**Needs you (real camera):** after approving, hold your movement a moment and check nothing is played by accident; Get started starts the rest check by itself; clicking a movement starts recording; the approve screen is clear; blink vs one-eye; Continue within and after an hour; on the talking screen, whether the Movement seen light matches your movement and scanning through Favourites, Helper and Clear feels right.

**Checked:** typecheck, 881 tests, build, 83/83 browser checks; independent testers passed it. The browser companion is left out for now.

**Untested:** the real Supabase project end to end, two real devices, and the camera with a real person.
