# Demo runbook — caregiver requests

The steps to show: a person uses a comfortable movement to ask for water, a caregiver on another screen sees it and answers, and the person sees the answer. The browser companion is not part of this demo.

## Before the demo (once)

1. **Code:** `git pull`, then `npm install` (the Supabase package is new on `main`).
2. **Settings:** `.env.local` in the project folder has exactly these two names (not `NEXT_PUBLIC_…`):
   ```dotenv
   VITE_SUPABASE_URL=https://axjqywgyzjkltexbnhld.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
   ```
3. **Supabase:** Authentication → Sign In / Providers → **Allow anonymous sign-ins** on, then **Save changes** at the bottom. This is required: each person's device signs in anonymously and the invitation code ties it to that one person; patients never make accounts. Each caregiver account is listed under Authentication → Users with a confirmed e-mail.
4. **Check the service:** `npm run check:care`. Every line must say PASS.
5. **Check the database:** paste [supabase/checks/verify-care.sql](../supabase/checks/verify-care.sql) into the Supabase SQL Editor and Run. Every row must say `ok = true`. The `data:` rows show how many caregivers, people and requests exist. An error such as "relation … does not exist" means the migration in `supabase/migrations/` was never run.
6. **Tidy the people list:** on the caregiver dashboard, **Remove** test people you do not want on screen. They move to "Removed people"; that cannot be undone, so make a new person instead of reusing a removed one.

## Run it

Use **two browsers or profiles that do not share sign-in** (for example a normal window and an incognito window, or two laptops). All tabs in one browser profile share one account. Pairing in a window that holds the caregiver is refused ("Signed in as a caregiver"). The opposite is the real trap: signing in as the caregiver in a window that holds a paired person replaces that device's pairing for good, and the person then needs a new invitation.

1. Start Motif: `npm run dev`, then open `http://127.0.0.1:5173/`.
2. **Caregiver window:** open `http://127.0.0.1:5173/#/caregiver`, sign in. Under People, **Add person** (for example "Alex"), then **Create invitation**. The code works once and expires in 10 minutes.
3. **Person window:** open `http://127.0.0.1:5173/`. Open **Caregiver requests: pair this device**, type the code, **Pair this device**. It says who requests go to.
4. **Person window:** **Get started**, rest for the short check, pick a movement (for example tilting the head), then **Approve and start**. The main list now shows **Ask caregiver** after Pause. No camera on that device? **Use assisted input (Space switch)** on the start screen works too: Space selects the highlighted item.
5. Select **Ask caregiver**, then **Ask for water**. The person's screen says it is sending, then sent.
6. **Caregiver window:** the request appears within about 2 seconds; the tab title shows `(1) Caregiver dashboard · Motif`. Press **Acknowledge** — the person's screen says it was acknowledged — then **Mark complete**.
7. Optional: pair a second person in a **different browser or profile** (a second incognito window shares the first one's sign-in) and send **Ask for general help** to show two people kept apart.

Requests can also be sent with a helper's mouse: open **Ask caregiver** and click a request button (not while paused).

## If something goes wrong

| What you see | Cause and fix |
|---|---|
| Caregiver page: "The caregiver dashboard is not set up yet" | `.env.local` names are wrong or the server was not restarted. Fix the names, restart `npm run dev`. |
| Pairing: "Pairing is turned off on the caregiver service" | Anonymous sign-ins are not saved as on. Step 3 above, then `npm run check:care`. |
| Pairing: "That invitation code is not valid or has expired" | Codes work once for 10 minutes. Create a new one. |
| Pairing: "Signed in as a caregiver" | This window holds the caregiver account. Use another browser/incognito for the person. |
| Sign-in: "That e-mail and password do not match" / "not confirmed yet" | Check the account under Authentication → Users. |
| No **Ask caregiver** tile | The device is not paired. Open **Caregiver requests: pair this device** on the start screen or inside **Helper**. |
| Request card says "Not confirmed — it may not have reached your caregiver" | The service could not be reached. Press **Retry** or select it again; the same request is reused, never duplicated. |

## After the demo

On the caregiver dashboard, **Clear everything** deletes every request (open and finished) and every invitation, and unpairs every device. The group, the removed people's names and the device sign-ins stay in Supabase (delete anonymous users under Authentication → Users if wanted). Nothing is deleted automatically. Video and movement data never leave the person's computer.
