# Motif technical handoff

## W2 — care setup quality of life (coordinator acting as Agent 3, 2026-10-17)

- User asked to "make sure it's working and add any quality of life stuff". Headless Chromium against the hosted project: caregiver route renders sign-in (VITE config parsed); pairing reaches `POST /auth/v1/signup` → 422 `anonymous_provider_disabled` (anonymous sign-ins still off on the project; user must Save the toggle).
- Design `docs/workstreams/request-relay/qol.md` revision 1: w2_review APPROVED before code. Commits `ae82621` truthful auth/pairing errors, `c171bcd` open-request count in caregiver tab title, `3c9eaa9` `npm run check:care` (read-only setup check), `af07c89` title offline/stale test + script fixes. w2_testing PASS at `3c9eaa9`; follow-ups in `af07c89` (stale-title mutation now caught).
- `npm run check:care` on the hosted project: 10 PASS, 1 FAIL (anonymous sign-ins). After the user saves the setting, rerun it, then the two-window pair → water → acknowledge test.

## W1 — request wiring (coordinator acting as Agent 3, 2026-10-17)

- Agent 3 offline; user asked the coordinator to finish Agent 3's remaining wiring, without the browser companion (C4 deferred by the user). Branch `feature/request-wiring` from `main` `24e9c6b`; not pushed. Design: `docs/workstreams/request-relay/wiring.md` revision 2 — w1_review BLOCKED revision 1 (B1: identity rebuild undid Pause), APPROVED revision 2.
- Commits: `f991181` plan, `942b297` Ask level (`navigation.ts`), `6ec874c` session wiring (`RequestPort`, pause-safe rebuild, `selectRequest`, `announceExternal`; `session.requests.test.ts` over real PGlite SQL), `ce066d8` Root/App/views (one controller per participant session on `sharedCareClient()`, panel + pairing card; `CommunicationRequests.test.tsx`).
- Checks at `ce066d8`: `npx tsc --noEmit` PASS; `npx vitest run` 64 files / 869 PASS; `npm run build` PASS; `npm run test:browser` 83/83 PASS. Mutation: removing the paused guard in `onRequestsChanged` fails the 3 B1 tests.
- Local `.env.local` renamed from `NEXT_PUBLIC_*` to `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` (gitignored; no secret stored here).
- Hosted project `axjqywgyzjkltexbnhld`: migration applied (tables and RPCs exist and deny signed-out callers); one group "GG" with 3 unpaired participants (from the user's screenshots). Auth settings still report `anonymous_users: false` at 19:53 EDT — user must save the toggle. Not yet observed: hosted pair → send → acknowledge loop, two devices, camera.
- Independent testing review (w1_testing): FAIL at `ce066d8` on coverage only (B-T1: no test for an unpaused identity change; code correct). Fixed by `8c5b1ea` (revoke and generation-only switch mid-hold, label update, stale reset). Re-check at `8c5b1ea`: **PASS**; the four previously surviving mutations are caught. Full suite 64 files / 873 PASS, tsc PASS; `npm run test:browser` 83/83 at `ce066d8` (no source change since). Open non-blocking: Root wiring has no direct test (N4); Root never disposes the controller (N3, recorded).
- Known limits: one Auth identity per browser profile (use separate profiles/incognito); two controller announcements in one update — only the last is heard.

## STAGING BRANCH — all open PRs merged (2026-10-17)

- Branch `staging` in worktree `/root/home/eso/Projects/Motif-staging`, from `origin/main` `e2d5871`. Merged in order: #7 `origin/feature/request-relay` `1e94ede`, #9 `origin/feature/participant-requests` `c699747`, #10 `origin/feature/caregiver-dashboard` `9b9afa4`, #8 `origin/ethan-features` `4c52f6b`. PRs #1–#6 were already in `main`. Local unpushed `ethan-features` commit `75f2ce9` (adds `@supabase/ssr` and a caret `supabase-js` range) was NOT merged; `request-relay` already pins `@supabase/supabase-js` 2.118.0.
- First three merged without conflicts. `ethan-features` conflicted in `README.md`, `STATUS.md`, `plan.md`, `src/app/profiles.ts`, `src/app/session.ts`; resolved by keeping both sides (`CONTAINER_VERSION` 1 + `PROFILE_VERSION` 2 + `VERIFICATION_POLICY_VERSION` 1; both import lines; both plan items; care-aware privacy text plus phrase-group storage text).
- Semantic break after the merge: 5 R15 tests (`session.conflicts.test.ts` 2, `CalibrationPreparation.test.tsx` 3) assumed the flat phrase list; they passed before the `ethan-features` merge. Commit `187293a` opens Quick before the long-hold check (plus an announcement assertion, shown to fail if a second action fires) and reaches Add movement through More.
- Results at `187293a`: `npx tsc --noEmit` PASS; `npx vitest run` 62 files / 857 tests PASS; `npm run build` PASS (ignored runtime assets copied from the main checkout).
- Not done: participant request controller/panel/pairing are merged but not wired (`docs/workstreams/participant-requests/integration.md` steps 1–8, Agent 3); browser companion not built; hosted Supabase and two-device checks pending; camera checks pending. Independent testing review of the merged tree recorded in the next bullet.
- Independent testing review (staging_testing, at `e281009`): **PASS**, no blockers. Re-ran `tsc` exit 0, vitest 62 files / 857 PASS, build PASS, `npm run test:browser` 83/83 PASS (headless Chromium, ports 4317/4318). Mutation (long hold firing Select again) fails both edited conflict tests on the new announcement line. Probe: a real version 1 Last setup without `checks.policyVersion` is re-checked on Continue, kept, and re-saved as version 2 with `policyVersion` 1. Non-blocking follow-ups: no committed test for that legacy-without-policy path (`session.merge.test.ts` `v1Last` fixture carries `policyVersion` 1); PR #7 alone fails 7 R15 tests (fixed by `03c606f` from #9), so do not merge #7 into `main` before #9; the wiring sketch in `docs/workstreams/participant-requests/integration.md` step 4 predates the levels (put request targets in a level via `navigation.ts`); unused `targets` in `restrictedScanner` (`src/app/session.ts:1325`); trailing blank line in `session.merge.test.ts`. README no longer names "Delete all saved profiles" because that control no longer exists.

## SHARED BASE READY — Agents 1, 2 and 4 may start (2026-10-17)

- **Common base commit: `2055e1c` on branch `feature/request-relay`** is the verified source tree; branch from the tip of `feature/request-relay`, where every commit after `2055e1c` changes documentation only and leaves every source file identical. Local only; nothing pushed. Earlier Agent 3 commits are NOT a valid base: the merge of committed `main` and the frozen browser command port only exist from `2055e1c` onward.
- Checks executed on that exact tree in `.cache/worktrees/request-relay`: `npx tsc --noEmit` PASS; `npx vitest run` **40 files / 496 tests PASS**; `npm run build` PASS (asset check, typecheck, Vite 49 modules). Working tree clean. The browser/privacy checks were last run at `4759b2f` and have NOT been rerun at `2055e1c`.
- Three commits added in this session: `4d9e0af Merge main into care branch` (finished the `main` merge Agent 3 left conflicted in `STATUS.md`, `progress.md`, `reasoning.md`; the resolved text was already in the working tree but never staged), `c4b112c Recheck legacy profile policy` (legacy or incompatible saved profiles are re-checked instead of deleted, plus its tests), `2055e1c Add browser command contract` (`src/care/browser-contract.ts`, exported from `src/care/index.ts`).
- Shared contracts for all teammates, from `src/care/index.ts`: `CARE_CONTRACT_VERSION`, `REQUEST_KINDS`, `CareError`, `createSupabaseCareClient`, `parseCareConfig`, and the types `CareClient`, `CareRequest`, `CareSnapshot`, `CareGroup`, `CareAccess`, `Participant`, `Invitation`, `RequestKind`, `RequestStatus`, `CareConfig`, `CareConfigState`. Agent 4 uses `BROWSER_COMMAND_VERSION` with `BrowserCommand`, `BrowserCommandResult` and `BrowserCommandPort` (a type-only port; Agent 4 implements permission, identity and runtime validation).
- Still owned by Agent 3 and still pending: hosted Supabase SQL migration, anonymous sign-in and demo caregiver accounts (`docs/supabase-setup.md`); role-aware routes; mounting the participant and caregiver screens; real two-device delivery; rerunning the browser/privacy checks at the integration tip. Each laptop needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Teammate worktree start command, run from `C:\Users\light\Motif` (replace both names per agent): `git worktree add .cache/worktrees/participant-requests -b feature/participant-requests feature/request-relay`. Do not edit another agent's worktree. Never push.

## Active implementation — Supabase foundation (R16)

User chose Supabase Free and requested implementation; project created on a friend's laptop, hosted setup/connection still pending here. Work ONLY in .cache/worktrees/request-relay on feature/request-relay (base 17ecce3), not active main or the R15 preview worktree. R16rev2 independently approved before code; foundation implemented in small local commits through4759b2f. Independent455tests/typecheck/configured-browser/privacy PASS; build rerun after local ignored WASM setup. See docs/workstreams/request-relay/{reasoning,progress}.md and docs/supabase-setup.md. Current owner root; workers returned ownership, conflict_tests final tester. Next approved step is isolated committed-main reconciliation under reconciliation.md revision1, then version cached check evidence and freeze the browser command port, rerun checks and provide one exact common base for Agents1/2/4. Do not start dependent implementation against incompatible bases. Hosted SQL/Auth, participant/caregiver screens, routes, extension and actual two-device checks remain pending. This is Agent3's backend foundation, not all C1-C6 complete. Never push.

## Latest instruction update — accounts and connected completion

User requires the built features to connect and caregivers to have access only to appropriate accounts. Coordinator expanded the selected plan's Accounts/pairing/access matrix and Integrated completion contract, all four prompts, AGENTS.md and decision/reasoning records. Scope: caregiver sign-in, participant device pairing, own-group/own-request backend permissions, expiring invites/revocation, old-session cleanup, shared auth contract, role-aware routes and actual integrated acceptance. Agent 3 owns wiring/merged checks; feature workers implement their assigned views/adapters. Independent conflict_reasoning reviewed the actual six-file diff: PASS, no blockers; independently executed whitespace/local-link checks with zero issues and verified the primary access-control source. No app tests rerun for documentation-only changes; no application/auth implementation started here. Next: share these updated instructions with all four teammates (earlier pasted prompts predate this update), then use the agreed base/contracts/review workflow before coding.

## Latest handoff preparation — four agent prompts

User requested a prompt for each teammate/branch. Coordinator wrote docs/agent-prompts.md, linked it from the selected plan, and added the concurrent-workstream journal rule to AGENTS.md. No application code/branches/workers/services were started. Agent 3 prepares the reconciled base and shared contracts first; other agents may inspect/design in parallel. Feature agents own their workstream reasoning/progress documents; integration owner alone edits shared/root files. Independent conflict_reasoning reviewed the actual prompts and rule/plan diff: PASS, no blockers; independently executed whitespace/local-link/mandatory-path checks with zero issues. No app tests rerun for documentation-only changes. Deliver four copy-ready prompts to the user; the human team shares/pushes commits.

## Latest selected plan — connected caregiver demo and four branches

User selected **caregiver requests plus a limited browser companion prototype**, with real two-device request delivery while camera/calibration data stays local. Event is Hack the Valley. Coordinator wrote docs/caregiver-demo-plan.md and linked it from plan.md; no application files/services/deployments changed. Four bounded roles: existing communication teammate on participant requests, caregiver dashboard, relay/backend plus sole shared integration ownership, and browser adapter. State: selected product scope; technical implementation reviews/contracts/base reconciliation still pending. No new build Goal or implementation workers started. First next action: reconcile wink/conflict/current teammate changes on an agreed passing base, freeze contracts, get bounded implementation designs reviewed, then distribute the four branches. Do not ask again whether this selected scope/networking is desired. Original checkout and other workers remain untouched; keep the existing isolated preview running.

Read-only conflict_reasoning/mapping_investigation confirmed visibility/network blockers and supplied feasibility feedback. Independent conflict_reasoning reviewed both the initial proposal and final selected plan: PASS; independently executed whitespace/local-link/stale-path checks with zero issues and verified the primary ML/event sources. Public event theme/rules contain no found LLM requirement; detailed hacker package unverified. Public final deadline conflicts (8 AM header versus 10 AM rules text on Oct18); initial submission Oct17 9 PM ET. Plan for earlier final time and verify with the team. No application tests rerun for documentation-only planning. No unresolved planning-review blocker remains; implementation checkpoints C1–C6 still open.

## Latest planning clarification — separate movement actions

User confirmed different verified movements should do different things, e.g. eyebrows → Next and mouth opening → Select. Coordinator recorded this requirement in plan.md and reasoning.md on the isolated branch only. State: product clarification recorded; no new application implementation. Existing four-action mapping/step mode is the baseline; further demo-expansion features and extra command types still await selection. No teammate-owned communication files or original-checkout files changed. Next: collect remaining feature choices, then define shared contracts and four branch boundaries before concurrent implementation. Independent conflict_reasoning inspected the three-document diff and existing mapping: PASS, no blockers; `git diff --check` PASS. No application tests rerun for this documentation-only clarification.

## Latest isolated task — R15 Open mouth / head conflict

Latest user reports tilt down and turn right interfere with Open mouth. User requests ambiguity-safe personalized inputs, then excludes communication UI/new buttons owned by teammate. Work ONLY in `C:\Users\light\Motif\.cache\worktrees\gesture-conflicts`, branch `fix/gesture-conflicts`, base `ba15850`. Original checkout has Grok's uncommitted wink/hold work: never edit/stage/commit it or stop its processes. No automatic merge while Grok is active. Earlier build Goal stays paused.

State: **software verified; real-user mouth/head calibration pending.** R15 revisions 1 and 2 independently APPROVED by conflict_reasoning before their implementation. Root coordinated recognition, verification, session and docs; mapping_investigation implemented only calibration prompts/diagnostics and returned ownership. Independent conflict_tests completed final execution/review with explicit PASS. All agents read the canonical skill/four docs. No worker retains file ownership and no partial implementation remains. Isolated baseline was 31 files/355 tests PASS. The new co-motion fixtures reproduced eight failures before the fix.

Final independent commands: `npm test -- --reporter=dot` → **35 files/378 PASS**; `npm run typecheck` PASS; `npm run build` (assets/typecheck/Vite) PASS; `git diff --check` PASS. Tester ran all 67 synthetic-camera browser checks on isolated ports 4437/4438 using an in-memory port substitution (tracked browser script unchanged); both test servers exited. Seven adversarial runtime probes passed. Saved-profile probe passed: correct first voiced target, dropout after a changed-target preview, corrected spoken unfinished target, full restarted Rest, exactly four rechecks and disarmed approval. The review first BLOCKED a stale spoken preview on interruption; fixed by naming the next target on every Rest cue. A newly obsolete announcer assertion was corrected while retaining countdown deduplication checks. No unresolved automated failures.

Coverage: mouth + tilt down / turn right with smoothed gradual co-motion; a responder prepares during Rest without peeking at Action; full held-out/cross-check/negative gates; frozen models; separate existing Next/Select actions. Actual simultaneous activation still fails, even after an earlier correct event, and preserves old controls. Rest/rearming, threshold edges, opposite directions, missing/wrong/repeated/ambiguous explanations and saved-profile preparation are pinned. Changed code is limited to recognition/verification, session capture metadata/cues, calibration views/diagnostics and associated tests. No communication-screen or mapping-editor change.

An isolated dev server is running for the user at **http://127.0.0.1:5187/**, exec session **66988** (workdir THIS worktree; `npm run dev -- --port 5187 --strictPort`). Leave it running for user testing; stop only this recorded process when requested, never Grok's node processes. Original checkout has not been edited/staged/committed by this task. Build assets were copied into this worktree's gitignored public directories. Dependencies resolve from ancestor; only `node_modules/@mediapipe` is a read-through junction for the asset validator; Vite caches live in this worktree. No real camera opened. Native test/build workers needed approved execution after sandbox `spawn EPERM`.

Next pickup: (1) inspect this worktree's status/log and preserve the isolated preview; (2) run real-person ACCEPTANCE.md 6.6 when the user tries it, retaining failed-check numbers if needed; (3) after concurrent work is finished and integration is authorized, compare Grok's recognition/calibration changes and integrate the focused commits with review and regression checks. Do not automatically merge, cherry-pick into, or push the active original branch. The software verification does not establish real-person comfort, accuracy, head labels or cue audibility.

R15 local code commits (in order): `8f2fde6 Fix gesture conflicts`, `7db6bd2 Explain gesture check failures`, `f8702e4 Prepare upcoming gesture checks`, `2f73157 Clarify calibration preparation`. Last passing code is `2f73157`; a separate documentation commit follows it. All commit messages are subject-only, with no coauthor/signature/body. Final documents were independently checked by conflict_reasoning: PASS. No source edits followed the final 378-test/build PASS. No uncommitted implementation or unresolved software blocker remains; verify actual Git status before pickup. Nothing merged or pushed.

Plain-language summary: [STATUS.md](STATUS.md). Build Goal: approved software scope COMPLETE as of session 3 (full P0, P1, hardening; P2 excluded); all human/hardware acceptance pending — see [ACCEPTANCE.md](ACCEPTANCE.md). The user is asleep or away: do not ask questions; reason through problems, using subagents for independent review. The camera is covered: never open the real webcam and never claim live-camera, comfort, speech-audibility or hands-free acceptance.

## Latest task — hide phrase groups and Favourites (R19)

- User: the merged board felt odd (group tiles "Favourites (empty)", "Open Quick, 3 phrases"); asked to hide the new things. Session option `phraseGroups` (default false in the app via `useMotif`; test support passes true). Design: reasoning.md R19 revisions 1-2 APPROVED; criteria F1-F6.
- State: **software verified; human acceptance pending** — commits 82288f5, fe413d7 plus QA tests; vitest 74 files/1126, tsc clean, build OK. Favourites/groups code and data untouched. To re-enable: change the default in `src/app/useMotif.ts`. Not pushed.
- Offered next (awaiting user go-ahead): hide the camera panel in assisted mode, drop "N phrases" count, first-time hint line, larger hint text; product choices: caregiver link placement, Speak highlighted on an empty message.

## Current task — merge origin/main into ux-simplify (R18)

- User ran `git pull` and got divergent branches; chose "Combine both" (main's phrase groups/Favourites/caregiver + my message bar/Helper/confirmations). Base `ux-simplify` 9dade52; `origin/main` 24e9c6b (119 commits, 857 tests). First merge attempt aborted (14 conflicting files); nothing lost.
- Design: reasoning.md R18 revisions 1-2, APPROVED. Criteria: UX_ACCEPTANCE.md M1-M12, MH. State: **software verified; human acceptance pending (MH)** — merge `1578bab` plus fixes; QA tests `b5584c6`; vitest 70 files/1091, tsc clean, build OK. Next: user tries it with the camera, then push ux-simplify and open a PR if wanted (not pushed).
- `.env.local` holds the two VITE_SUPABASE_* values the user pasted (gitignored; never commit). Nothing pushed.

## Current task — branch ux-simplify (fewer pages)

- User: "so many pages … simple and intuitive … fix it". Branch `ux-simplify` off `ux-comm-screen` at `b2adf7c` (513 tests). Practice stays required (plan.md decision kept; shown on the Talk screen).
- Slice A (views, copy, progress bar, mapping cards; no stage-machine change): reasoning.md "UX simplify, slice A" revision 1; criteria U1-U12, UH. State: **software verified; human acceptance pending (UH)** — commits f8b36ee..e70b1c0 plus QA tests; vitest 38 files/595, tsc clean, build OK.
- Slice B: **software verified; human acceptance pending (VH)** — commits 6b80d24..7a8fa31 plus QA tests; vitest 39 files/638, tsc clean, build OK. Next: merge origin/main (119 new commits: caregiver dashboard, participant requests, phrase groups) into ux-simplify; no push.
- Agents: reviewer ae8ac905 (design), developer a7a8cb8d, QA ae97aab9 (owns `src/ux-simplify.acceptance.test.tsx`).

## Previous task — branch ux-comm-screen (communication screen)

- User approved the mockup (https://claude.ai/artifact/W8t4tg1TKfoiHHrk9SZ4Cr) and asked to build it, with Change controls, Add a movement and the other important helper options prominent. Branch `ux-comm-screen` off `ux-landing` at `1e17e06`. Baseline: tsc clean, vitest 34 files/461, build OK.
- Design: reasoning.md "UX comm screen" revision 1. Criteria: UX_ACCEPTANCE.md C1-C14 + CH.
- State: **software verified; human acceptance pending (CH).** Design revision 2 APPROVED; developer commits ceb41fc, f77e76e, b6110dd, 9365806; QA round 1 PASS (51 acceptance tests, 5 mutations caught, C12 screenshots). Coordinator: vitest 36 files/513, tsc clean, build OK. Next: user tries it with the camera; then PR if wanted. Nothing pushed.

## Current task — merge `origin/main` into `ethan-features` (R19)

- User (awake, 2026-10-17): "merge main". Base: branch `ethan-features` at the commit after this note; `origin/main` at `e2d5871`. Trial merge (throwaway worktree, removed) conflicts in 10 files.
- State: **software verified; human acceptance pending.** Merge `3774ce3`; R19 revision 2 APPROVED (conditions folded in); follow-ups `e4b48f4`..HEAD. Independent r19_testing BLOCKING (quick Continue restoring saved phrases untested) → `71c32db` test (+ unreadable-entry test, small fixes `f175255`, `1fb5554`, docs `fdf9736`) → re-check PASS. Last: tsc PASS, vitest 40 files/602 PASS, build PASS, browser-check 83/83. Branch is 0 behind `origin/main` (`e2d5871`) at last fetch.
- Next action: the user pushes `ethan-features` and opens the PR on github.com (the local `gh` login cannot see this private repo). If `main` moves first, repeat the merge procedure. Supabase edits in `package.json`/`package-lock.json` remain uncommitted and unowned.
- Owner: Claude Code coordinator. Files: all conflict files plus tests adapted for navigation. Do not push. Leave the unrelated Supabase edits in `package.json`/`package-lock.json` uncommitted.
- Next action: after R19 is APPROVED, `git merge --no-commit origin/main`, resolve, run tsc + full vitest, commit the merge; then follow-up small commits (favourite autosave rule, tests, docs); then independent testing review.

## Latest focused task — communication navigation and saved phrases (C1 / R14)

- User (awake, 2026-10-17) asked for easier message navigation and saved/favourite messages, then approved planning C1. Base `ba15850` on branch `ethan-features`, clean tree.
- State: **software verified; human acceptance pending** (ACCEPTANCE.md C1.1–C1.9). Last passing commit `79c0321` (code) — tsc PASS, vitest 36 files/478 PASS, build PASS (at `2b62ab9`, no app code changed since), browser-check 83/83. Independent c1_testing: BLOCKING B1 (resets after selection/openGroup untested) → `b628717` tests → re-check PASS.
- Owner: Claude Code coordinator (no parallel workers yet). Files: new `src/app/vocabulary.ts`, `src/app/navigation.ts` (+tests); `src/app/profiles.ts`, `session.ts`, `types.ts`, `CommunicationView.tsx`, `SetupViews.tsx`, `styles.css`, `scripts/browser-check.mjs`, README/ACCEPTANCE/STATUS.
- Steps: C1a vocabulary `ed6707a`+`f8ba93a` — done. C1b profiles v2 `41c2dd0` — done (browser-check 67/67). C1c navigation `5fd3db7` — done. C1d session levels `ba5377b`+`f437d7f` — done (vitest 457, browser-check 67/67). C1e composer actions `b5ff96d`+`1442b06` — done (vitest 35 files/469). C1f UI `019b17b`+`a3df4ab`+`c7e741d` — done. C1g browser-check/docs `802ac1a`+`bed78f7`+`b7b18f8` — done (tsc PASS, vitest 36 files/475 PASS, build PASS, browser-check 83/83). Review fixes `b628717`+`79c0321` — done; c1_testing re-check PASS.
- Implementation notes (routine, conservative): v1 migration drops repeated phrases (a group cannot hold duplicates) instead of rejecting the whole profile; group names must be unique (case-insensitive); new group id is max+1 of current ids, so removing the highest id can reuse it (harmless: phrase ids resolve against the current vocabulary, edits only while paused, Resume rebuilds at top). Re-validation on confirm is defence in depth: the one Resume rule already drops a confirm level if phrases changed while paused (tested).
- Not ours: `package.json`/`package-lock.json` gained `@supabase/ssr` and `@supabase/supabase-js` at 15:06 from another process; left untouched and uncommitted. A backend is outside plan.md scope; user to decide.
- Next action: none required for C1 software. Optional non-blocking polish (needs its own test review): N4 refresh tiles while paused after an edit, N5 resync group-name field, N6 copy vocabulary in the snapshot. Person: run ACCEPTANCE.md C1.1–C1.9 and 3.6. No processes left running; worker ownership released.
- Rule: every commit passes `npx tsc --noEmit` and the full `npx vitest run`; browser-check at C1b, C1d, C1f, C1g. Add the cross-build duplicate-name note to README in C1g.

## Latest focused task — merge of main into cat-features (R17)

- User asked to resolve the merge of `main` (a0be7f0: wink channels, automatic Last setup, quick Continue) into `cat-features` (R15 one-hour reuse, R16 back to start). User decision: keep main's automatic saving and Continue, keep both back-to-start buttons, apply the one-hour rule to Continue (check times stored with the profile).
- State: **software verified; human acceptance pending.** R17 revision 1 NOT APPROVED (B1 failed restore kept reusable times; B2 disclosures) → revision 2 APPROVED before code. Independent testing review PASS after one added disclosure test (tsc, vitest 31 files/393, build; 10 mutations caught; untestable equivalents noted). Merge committed locally; nothing pushed; no processes running.
- Files: `src/app/session.ts`, `src/app/profiles.ts` (`checks`), `src/app/session.test-support.ts` (wallClock), `src/components/CommunicationView.tsx`, `ProfileViews.tsx`, `ReviewViews.tsx`, `src/App.test.tsx`, `src/app/session.profiles.test.ts`, docs. Pending person check: Continue within and after an hour with a real camera.

## Branch cat-features — Back to start from assisted input (R16, numbered R15 on that branch)

- Same "Done, back to start screen" button inside assisted input started from the start screen. Software verified (374 tests then); human check pending.

## Branch cat-features — save panel, Back to start, one-hour reuse (R15, numbered R14 on that branch)

- Back to start after saving; one-hour in-memory check reuse. Superseded in the merge by R17 (main's automatic Last setup with stored check times). Independent reviews passed on that branch (370 tests).

## Latest focused task — wink channels and peak hold (R14)

User: blink affects close-one-eye; only Open mouth works well. **Software verified; real-user wink/hold pending.** R14 revision 2 independently APPROVED (wink_rereview) before code. Independent r14_testing BLOCKING (4× skip and density untested) → tests added → recheck PASS (tsc, vitest 364, build). Worker ownership released. No real webcam. Overall Goal paused.

- Wink: `winkLeft/Right = clamp(ipsi blink − contra blink)` from raw blendshapes; chooser/discovery Close-eye uses wink only; wink `activationMs` 500, others 250. A two-eye blink is near 0 wink.
- Peak hold: Action strength is the best dense ≥600 ms timestamp slice (q25), skipping internally spiky windows (q75 > 4× q25). Rest / R12 tails stay time-fixed. Old profiles refuse restore on the changed feature schema.
- Next person step: refresh `npm run dev`, try Close one eye without blinking both, and try eyebrow/head/lips with a short hold. Overlay still explains Rest vs Action. Commit locally without a Co-authored-by trailer if you want this saved (`Add wink peak holds`, `Test wink peak holds`, `Record wink hold checks`). No real camera was opened here. Nothing pushed.

## Previous focused task — camera diagnostics and Rest / Action cues (R13)

- User reported calibration still fails; requested camera overlay, Rest↔Action beeps, Rest/Action only at five seconds each. Base `2ee25cf`. Focused task; overall Goal stays paused.
- State: **software verified; real-user calibration/comfort/beep audibility pending.** R13 revision 1 and 2 independently APPROVED by overlay_review before the matching code. Independent r13_testing BLOCKING (pending-at-boundary fixture) → fixture fix → recheck PASS. Coordinator: tsc PASS; vitest 31 files/353 PASS; `npm run build` PASS; tester also ran browser-check 67/67 with a synthetic camera.
- Behavior: trials alternate 5 s Rest / 5 s Action and share only the trailing Rest. Overlay shows live smoothed values, rest baseline, thresholds when learned, and recorded failure numbers. Low/high beeps on Rest/Action; mute on the camera panel. Held-out checks use an explicit Action window so shared Rest may begin in relaxation; last pre-Action frame must be `armed` and neutral; exactly one intended event inside Action.
- Next person step: refresh `npm run dev`, uncover the camera, run ACCEPTANCE.md 3.2 and 3.6, read the overlay if it still fails. No real camera was opened here. Nothing pushed.

## Earlier focused task — return-to-rest rejection (R12)

- User reported all attempted movements fail "An attempt did not return to the personal resting baseline." Base `7914520`, clean tree at start. This authorized a focused fix; the earlier overall Goal stays paused.
- State: **T2 software verified; real-user calibration/comfort pending.** R12 revisions 1 and 2 independently APPROVED by rest_review before implementation; independent rest_tests final verdict PASS. All agents read the canonical checkpoint skill and four project docs. Worker ownership released; no partial code or running processes remain.
- Fix: preserve the original baseline, but permit rest variation bounded by noise/range or a quarter of the weakest personal movement. Judge the final third of the return instruction with at least 600 ms of valid, dense evidence. No signal-dependent tail search, held-out fitting or change to live recognition/approval gates.
- Reproduction: original code failed all 7 new session cases with the reported error; unit cases were 10 failing/5 passing. First fix passed 5 session cases but still failed both gradual head returns. Reviewed revision 2 then passed all 27 new tests without weakening the original head fixtures.
- Coordinator: `npm test -- src/engine/calibration.rest.test.ts src/app/session.rest.test.ts --reporter=dot` → 27 PASS; `npm run typecheck` PASS. Independent rest_tests: `npm test -- --reporter=dot` → 27 files/321 PASS; `npm run typecheck` PASS; `npm run build` → local assets/typecheck/production PASS. Coordinator: `node scripts/browser-check.mjs` → 67/67 PASS with a synthetic camera; clean exit, servers closed. Sandbox Vite spawn EPERM required native-approved execution as before.
- Coverage: quiet baseline then varied relaxed face, gradual recovery, brows/mouth and signed head directions, unchanged frozen models, no approval before held-out/negative checks, 60 s varied rest with no actions, one selection per long hold, genuine no-return and negative activation rejection, weak/strong attempts, opposite residuals, sparse return tails and timestamp boundaries. Independent in-memory probes caught five bad alternatives (old strict cap, removed gate, strongest-attempt cap, signed rest distance, old premature return window); shared files unchanged.
- Local commits: `e01b8d9 Fix relaxed gesture returns`, `1aeb492 Test relaxed gesture returns`, `e234992 Test calibration recovery`; documentation handoff follows. Nothing pushed.
- Next actionable criterion needs a person: refresh the app, repeat calibration with natural relaxation, and record ACCEPTANCE.md 3.6. The fixed 3-second return window still cannot accommodate every possible slow movement. No real camera was opened, and actual success/comfort is not claimed. No unresolved automated failures or new product decisions remain; await user feedback.

Previous T1 (R11): steady 3/3/3 rhythm, next-cue previews and coherent spoken cues were independently verified at `7914520` (294 tests and 67 browser checks). R12 addresses the user failure that ideal-stream T1 tests missed; R11 pacing stays in place.

## Resume first (next agent)

1. Read all of `AGENTS.md`, `plan.md`, `reasoning.md` (R15 revision 2 is the latest focused change) and `.agents/skills/motif-checkpoint/SKILL.md`.
2. Work in the isolated worktree recorded above; run `git status` and `git log --oneline -n 10`. Its port-5187 preview is intentionally running. The original checkout is concurrently owned by Grok; historical sections below describe older completed tasks, not current process ownership.

1. Read all of `AGENTS.md`, `plan.md`, `reasoning.md` (R14 revision 2 is the latest focused change) and `.agents/skills/motif-checkpoint/SKILL.md`.
2. Run `git status` and `git log --oneline -n 10`. Expected: compare with "Last passing commit" below. No processes or extra worktrees were left running.
3. On a fresh clone or another computer, do "Fresh clone setup" first. Then run the baseline checks below. All must pass before you change anything.
4. Continue with the first unfinished item in "Exact next work" (software scope is complete; remaining items are optional or need a person). Commit each small passing chunk on its own (one module, feature step, test set or doc update). Never push.

## Previous passing commits (before R15)

- Last passing **committed** code: `ba15850` (merge of debug-overlay) / `0a3a004 Move camera diagnostics aside`. R14 wink/peak-hold software is in the **working tree, not committed**: the environment's git wrapper injects `Co-authored-by: Cursor`, which this repo forbids. Coordinator: typecheck PASS; vitest 32 files/364 PASS; build PASS. Independent r14_testing recheck PASS. Prior R13 software: tsc, 353 tests, build, browser 67/67. Nothing pushed.
- History note: the large commit `e2da549 Add guided calibration app` was undone at the user's request and rebuilt as 34 small commits (`5c56db0 Add checkpoint skill` … `370af21 Add build handoff notes`) with an identical tree; each code commit passed tsc and its own tests. Nothing was pushed.

## Fresh clone setup (another computer)

- Gitignored, so a clone lacks them: `node_modules`, the face model and WASM (`public/models`, `public/mediapipe`, `public/runtime-assets.json`), `.cache`, `dist`, `test-results`.
- Use Node 22.12+ (24.13.1 was used). Run `npm ci`, then `npm run setup:assets` (downloads the public Face Landmarker model from storage.googleapis.com and copies the matching WASM from node_modules; no user data is sent). `npm run build` fails its asset check until this is done.
- `scripts/browser-check.mjs` launches an installed Chrome or Edge through Playwright. If neither exists, run `npx playwright install chromium` and add a bundled-Chromium fallback to its `launch()` helper as its own small commit.

## Baseline commands (repo root, any OS)

- `npx tsc --noEmit` · `npx vitest run` · `npm run build` (also checks the local model/WASM assets) · `node scripts/browser-check.mjs` (run after build; uses Chrome's synthetic fake camera `--use-fake-device-for-media-stream`, never the real webcam; 67 checks incl. a dev-server run; `CHECK_DETAIL=all` lists every failing element; screenshots go to gitignored `test-results/`).
- Dev server for manual use: `npm run dev` (http://127.0.0.1:5173).
- Model/WASM assets live in gitignored `public/models` and `public/mediapipe`; if missing, run `npm run setup:assets` (needs network approval).

## Checkpoints

| Item | State |
| --- | --- |
| W0/W1/WF1/WF2 | Reached. |
| W2–W5 (camera, calibration, one-gesture communication, first slice) | Software verified; human acceptance pending (real webcam, live values, anatomical/head-direction labels, comfort, speech audibility). Reviews: r5_review → r5_rereview APPROVED; w2_w4_test_review → fixes → w2_w4_recheck PASS. |
| W6 remaining P0 (multi-gesture) | Software verified; human acceptance pending (`w6_test_review` re-check PASS at `e848456`). R6 revision 2 APPROVED (r6_review → r6_rereview). |
| W7a profiles/recalibration | Software verified; human acceptance pending (`w7a_test_review` re-check PASS at `fa56d76`). |
| W7b scoring/recommendations | Software verified; human acceptance pending (`w7b_test_review` re-check PASS at `5464487`). |
| W7c discovery | Software verified; human acceptance pending (`w7c_test_review` re-check PASS at `fefa186`). |
| W8 hardening | Software verified; human acceptance pending (`w8_test_review` re-check PASS at `8f22174`). |

## Exact next work (ordered)

1. DONE (session 3): W6 session tests (`describe('multiple gestures (R6)')`, 13 tests: add/cross-check/negative, interfering candidate, duplicate refusal, simultaneous movements, step mode, next across a boundary in fallback, idle fallback counting, previous, pause, one-movement mapping, Change controls/Keep current, Use previous, 4-movement reachability, 3-movement auto mapping, assisted, recalibration with a set). No session bugs found. Commits `b48b127`, `75f2ad1`, `5b9edcb`.
2. DONE: UI follow-ups `aa5db2e` (camera panel lists movements + actions), `3dcd476` (chooser disables used movements while adding), `c7e4e7f` (evidence labels cross-checks; evidence also shown on the comfort screen; App test scans mapping proposals).
3. DONE: W6 software verified; human acceptance pending. `w6_test_review` BLOCKING at `c7e4e7f` → fixes `3e85aa3`, `2cefb57`, `e848456` → re-check PASS (tsc, vitest 134, build, browser 12/12, mutants killed). Follow-up `6e017d0` (helper Pause/Resume reset the idle timer; 135 tests). Recorded in `reasoning.md` R6 review record and `plan.md`.
4. DONE: W7a software verified; human acceptance pending. Code `793068b`…`5e92fcc`; review BLOCKING (tests only) → `589654f`, `264baa2`, `fa56d76` → re-check PASS; order test strengthened after.
5. W7b IN PROGRESS: R8 revision 2 APPROVED (`d6a8e48`). Done: `8afc20c` runtime `cancelledId`/`cancelCause` (+`8a8bfd2` tests), `90bbb43` threshold fractions exported, `45fec4e` `expectedId` on attempts, `5e2ba20` `src/app/scoring.ts` (+tests), `b551628` session wiring (effort decision `comfortable-effort`, use counts, `tiring` stage + `never-mind`, proposals computed once with recommendation first, `proposeCustom`, snapshot `evidence`/`recommendation`), session tests `src/app/session.scoring.test.ts`. UI `df49a02` (TiringView, recommendation reasons, helper custom-controls form, per-movement evidence) + `7b3cd3d` App tests. Checks at `7b3cd3d`: tsc PASS, vitest 16 files/223 PASS, build PASS, browser 12/12 PASS. `w7b_test_review` BLOCKING (tests only) → `5464487` → re-check PASS. DONE: W7b software verified; human acceptance pending. Then W7c (R9) and W8 per `plan.md`.
6. W7c IN PROGRESS: R9 revision 2 APPROVED (`8cf414f`). Done: `3a66045` `src/app/discovery.ts` (+`6b23931` 15 tests), `4b63378` session stages `discover`/`discover-results` (`startDiscovery`, `discover`/`discover-again`/`full-list` decisions, `discovered:<i>[:<companion>]` targets), `src/app/session.discovery.test.ts` (7), `08a4a22` UI (ChooseView button, capture text, DiscoveryResultsView) + `d549617` App test. Checks at `d549617`: tsc PASS, vitest 18 files/251 PASS, build PASS, browser 12/12 PASS. `w7c_test_review` BLOCKING (tests only: chaining fixture, ranking/cap pinning, choice clearing, frame dropping) → `3529bad`, `4183a28`, `5588e48`, `8adc098`, `fefa186`; re-check PASS. DONE: W7c software verified; human acceptance pending.
7. DONE: W8 software verified; human acceptance pending (`w8_test_review` re-check PASS at `8f22174`; follow-ups `b46b63c`, `5303081`, `e40adc9`).
8. **Approved software scope complete (full P0 + P1 + hardening).** Every checkpoint W2–W8 is "software verified; human acceptance pending"; all plan.md boxes stay open until a person runs ACCEPTANCE.md with a real webcam. P2 remains excluded. Nothing was pushed (the user pushes).
9. If more time is available (optional, non-blocking leftovers from reviews): noisy-baseline pinning of the discovery `on`/`off` formulas (R9); defensive tests for counting a runtime `invalid` cause as unfinished (R8 M6/M8c); wording that a restored movement's practice strength dates from when it was trained (R8); browser check of target sizes on post-calibration screens is manual-only.

## Known notes and risks

- Head-direction labels (+yaw = person's left, +pitch = chin down, +roll = right shoulder) are derived mathematically; real-camera confirmation pending.
- The 60 s baseline valid-time cap is effectively unreachable (the 5-interruption cap fires first); kept as defensive code.
- `.cache/superseded/Workspace.tsx` (gitignored, original machine only) is an earlier agent's unused UI draft; not needed.
- Git prints LF→CRLF warnings on add (Windows); harmless. Do not change Git config.
- **Privacy correction (2026-10-17):** earlier checkpoint records said "no requests leave this device", but those browser runs lasted under 60 s and never closed the model. `@mediapipe/tasks-vision` 1.1.1 has built-in usage logging (counters, no images) that POSTs to `odml.pa.googleapis.com` every 60 s and on close; builds before `b070ba2` would have sent it in real use. Fixed by `src/tracker/offline.ts` (same-origin-only fetch/sendBeacon guard installed in `main.tsx`) plus a CSP meta in `index.html`; the browser check now stops the camera and proves the send was blocked.
- Two intermediate commits are not green on their own (no amend allowed): `3529bad` fails tsc (unused import, fixed in `4183a28`); `8adc098` has a failing App test (fixed in `fefa186`). Every other commit passed tsc and its tests.

## Environment (original Windows machine; check your own)

- Node 24.13.1, npm 11.8.0, Chrome and Edge installed. Pinned deps in `package.json`/lockfile (React 19.3.1, Vite 8.3.4, TS 7.0.2, Vitest 5.0.5, Tailwind 4.3.3, MediaPipe tasks-vision 1.1.1, Playwright 1.64.1, jsdom 26.1.0).
- npm defaults to offline; network installs need native approval with command-local flags. No global config changes.
- Git author identity is configured locally (values not logged).
- Historical pre-R15 session left no processes/worktrees. For the current isolated worktree and preview process, use the R15 handoff at the top of this document.

## Environment (Linux server, session 3, 2026-10-17)

- Linux x64, Node 24.18.0. `npm ci` + `npm run setup:assets` worked online. No Chrome/Edge installed: `scripts/browser-check.mjs` falls back to Playwright's bundled Chromium (revision 1248, already present in the default Playwright cache; otherwise `npx playwright install chromium`). Baseline at `c72dfd0`: tsc PASS, vitest 12 files/110 PASS, build PASS, browser-check 12/12 PASS.
- Coordinator: Claude Code (session 3). Commits from `f1291e7 Add bundled Chromium fallback` onward.

- **User-directed change (2026-10-17, branch `fix-record-movement`):** one automatic profile ("Last setup", reserved name, no naming UI) saved on approval and scan-speed change; Continue restores it using saved resting summary numbers (no rest check, no movement re-checks, controls still need approval). This was done at the user's request without a separate reasoning review; independent review of the quick-restore path is still pending. Real-camera behaviour untested (camera covered).

## UX build loop (branch ux-setup-flow off fix-record-movement `2040095`, started 2026-10-17)
- Plan: `/Users/vivianyang/.claude/plans/pasted-content-id-2ddb-you-are-goofy-dragonfly.md`; criteria `UX_ACCEPTANCE.md`; design `reasoning.md` (UX slice 1).
- Baseline: tsc clean, vitest 363/363 (31 files), build OK.
- Slice 1 state: design APPROVED (rev 2, `9b52e22`); QA (agent ae97aab9...) writing `src/app/ux-setup.acceptance.test.ts` (QA owns it); developer implementing in useMotif.ts, SetupViews.tsx, CameraPanel.tsx, ProfileViews.tsx, session.ts (profilesView hasBaseline), types.ts, App.tsx. Round 0 of 3.
- Next: implement slice 1, QA verify, commit small, then slice 2 (click-to-record) and slice 3 (merged approve screen).
- **Slice 1 software verified; human acceptance pending (1.H).** Commits aff3cc6..4b1003f plus acceptance tests; last passing commit is the one after 'Add slice 1 acceptance tests'. Agents: dev a7a8cb8d..., QA ae97aab9... (resumable via SendMessage). Next: slice 2 (click-to-record, rename on Approve) needs a design in reasoning.md and a reviewer before coding. Round counter resets per slice.
- Slice 2 (merged approve screen, first movement only): design written (reasoning.md 'UX slice 2'), criteria 2.1-2.8 in UX_ACCEPTANCE.md; next: reviewer (a0c73f94...) then QA (ae97aab9...) writes `src/app/ux-approve.acceptance.test.ts`, then dev (a7a8cb8d...). Slice 3 = click-to-record + rename on the Approve screen.
- Slice 2 design APPROVED (rev 3, `d46f1aa`). QA extending `src/app/ux-approve.acceptance.test.ts`; developer implementing (session.ts decisions/preview, types.ts, ReviewViews.tsx ComfortView, tests it intentionally changes). Round 0 of 3.
- **Slice 2 software verified; human acceptance pending (2.H).** Commits a91bc53, 4ff4d6b, tests 29a9a09 (412 tests). Slice 3 (click-to-record, rename on approve): design in reasoning.md 'UX slice 3', criteria 3.1-3.8 in UX_ACCEPTANCE.md; next: reviewer a0c73f94..., QA ae97aab9... writes `src/app/ux-record.acceptance.test.ts`, dev a7a8cb8d....
- Slice 3 design APPROVED (rev 2, `6a34eda`). QA finishing `src/app/ux-record.acceptance.test.ts`; developer implementing (SetupViews.tsx ChooseView, ReviewViews.tsx ComfortView, session.ts renameMovement, types.ts, tests it intentionally changes). Round 0 of 3.
- **Slice 3 software verified; human acceptance pending (3.H).** Commits a559869, 0b9463d; tests 00ff6b9 + focus test. `ux-setup-flow` complete in software: 431 tests, tsc, build pass. Human checks 1.H, 2.H, 3.H pending. Next branch: `ux-comm-screen` (criteria AC1-AC14 in the plan file) off `ux-setup-flow` or `fix-record-movement`; needs design + review first. Nothing pushed. Agents: dev a7a8cb8d..., QA ae97aab9..., reviewer a0c73f94... (resumable).
- **Hold length per movement (slice H) reverted at the user's request (2026-10-17)** with a revert commit on ux-landing; the original commits 5df857b..fed9ba6 remain in history if it is wanted again. Tree matches 6315311 (simplified start screen). 431 tests, tsc, build pass.

## R20 no practice page, Speak renamed Play (branch ux-simplify, 2026-10-17)
- **Software verified; human acceptance pending (PH).** Approval goes straight to the talking screen; "Use previous" moved to Change controls; button now says Play; evidence lines say "recorded attempt". QA table in `UX_ACCEPTANCE.md` (P1-P9 pass, PH pending, 8 mutation checks killed, Chrome assisted-mode check done).
- Last passing: tsc clean, 76 files / 1162 tests, build OK, on the commit "Reword recorded attempt evidence lines". Nothing pushed. Agents: dev a7a8cb8d..., QA ae97aab9..., reviewer ae8ac905... (resumable).
- Next: user decides on offered board fixes (hide camera panel in assisted mode, drop "N phrases", first-time hint, larger hint text), caregiver link placement, Play when empty, "Play again" rename, and whether to push `ux-simplify`.
