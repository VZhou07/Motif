# Motif build update

**On `main`:** all four pull requests are merged (accounts and requests foundation, participant requests, caregiver dashboard, grouped phrases). The missing connections (requests and pairing on the person's screen) are merged into local `main`.

**What works now (automated checks):**
- The person's main list: **Speak · Undo · Favourites · Quick · Needs · Pause · Ask caregiver · More**. **Ask caregiver** appears once the device is paired and lists water, bathroom, help changing position, general help and cancel. One selection sends one request; nothing is sent from Practice, while paused, or by speaking.
- Pairing: on the start screen (and under the message), open **Caregiver requests: pair this device** and type the caregiver's invitation code.
- Caregiver dashboard at `#/caregiver`: sign in, add people, make invitation codes, see and answer requests.

**Needs you:** in Supabase, anonymous sign-ins must be saved as on (the live setting still says off). Use a separate browser or incognito window for the caregiver and each person; one browser shares one sign-in.

**Checked:** typecheck, 873 tests, build, 83/83 browser checks; an independent tester passed it. The browser companion is left out for now.

**Untested:** the real Supabase project end to end, two real devices, and the camera with a real person.
