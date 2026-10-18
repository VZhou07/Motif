# W2 — Care setup quality of life, revision 1

Status: design for independent reasoning review. Coordinator acting as Agent 3 (offline), at the user's request ("make sure it's working and add any quality of life stuff", 2026-10-17). Branch `feature/care-qol` from `main` `2619391`. Never push without the user's OK.

## Evidence that motivated it

A headless Chromium run on the box against the hosted project (`axjqywgyzjkltexbnhld`, built app via `vite preview`) showed: the caregiver route parses the `VITE_` config and renders **Caregiver sign-in**; a pairing attempt sends `POST /auth/v1/signup` and gets **422** `{"error_code":"anonymous_provider_disabled"}`. The participant then reads "Pairing did not complete. Check the code or ask for a new one." — wrong advice: the code was never checked. Caregiver sign-in failures (wrong password, unconfirmed e-mail) are likewise collapsed into one generic `auth_failed` message.

## Q1 — Truthful auth errors

- `src/care/client.ts` `checkError` receives the SDK `AuthError` (`{ message, code? }`). Map by `code` only (never echo the provider's message):
  - `invalid_credentials` → `CareError('invalid_credentials', 'That e-mail and password do not match a caregiver account.')`
  - `email_not_confirmed` → `CareError('email_not_confirmed', 'This caregiver e-mail is not confirmed yet. Confirm it in the Supabase project, then sign in.')`
  - `anonymous_provider_disabled` → `CareError('anonymous_disabled', 'Device pairing is turned off on the care service: anonymous sign-ins are not enabled in the Supabase project.')`
  - anything else → existing generic `auth_failed`.
- `controller.ts` `pairingMessage`: `anonymous_disabled` → "Pairing is turned off on the caregiver service. The person who set up Motif needs to allow anonymous sign-ins (see docs/supabase-setup.md)." Other codes unchanged.
- The caregiver sign-in form already shows `CareError.message`, so it gains the two caregiver messages with no UI change.
- No new data flow; codes come from the same response. Tests: client unit tests with a fake SDK error per code; controller pairing test for `anonymous_disabled`; dashboard sign-in test for `invalid_credentials` text.

## Q2 — Open-request count in the caregiver tab title

- `CaregiverDashboard`: effect sets `document.title` to `(N) Caregiver dashboard · Motif` when N = outstanding requests > 0, else `Caregiver dashboard · Motif`; restores the previous title on unmount (route back to the participant page). Signed-out / not-a-caregiver states show no count (count comes only from the authorized board). No sound or notification change.
- Tests: title follows the count, drops on sign-out, restores on unmount.

## Q3 — `npm run check:care`

- `scripts/check-care.mjs`, read-only. Reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` from the environment, else `.env.local`; reports `NEXT_PUBLIC_*` names if found instead (the mistake seen on 2026-10-17).
- Checks, one PASS/FAIL line each: URL is a hosted `https://<ref>.supabase.co` origin; key is `sb_publishable_` or a JWT with role `anon` (refuses `sb_secret_` / service-role and stops); `GET /auth/v1/settings` reachable, `anonymous_users` and `email` enabled; each of `care_groups`, `participants`, `care_requests` answers (401/42501 = exists and protected; PGRST205/404 = missing migration); `rpc/motif_access` answers 42501 (exists, signed-out denied).
- Prints the Table Editor link `https://supabase.com/dashboard/project/<ref>/editor`. Never prints the key; sends it only to the configured project (the same public key the browser bundle already carries). Exit 1 when any check fails.
- Docs: one section in `docs/supabase-setup.md`. Tests: none beyond running it against the hosted project and a bad-config run (it is a dev script outside the app bundle).

## Out of scope

Browser companion; new tables or RPCs; Realtime; any change to who can see what.
