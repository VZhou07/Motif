# UX acceptance (branch ux-setup-flow)

Tags: TEST = automated, CHROME = observed in the running app (assisted mode, camera covered), HUMAN = needs a person or camera. Only HUMAN items may use subjective wording. QA owns `src/app/ux-setup.acceptance.test.ts`; the developer may not edit it.

## Slice 1: Get started, start-screen copy, overview

| ID | Tag | Criterion |
| --- | --- | --- |
| 1.1 | TEST | With no saved setup the start screen has one primary button "Get started". Clicking it starts the tracker and, once the camera is running, the session reaches `baseline` with no further click. |
| 1.2 | TEST | If the camera fails to start, the stage stays `welcome`, no rest check starts, the camera error is shown and "Retry camera" is offered. |
| 1.3 | TEST | With a saved setup, "Continue with your last setup" stays primary and "Set up again" is a secondary control that starts the camera and then the rest check without restoring anything. |
| 1.4 | TEST | With no saved setup, exactly one control on the start screen starts the camera (no second "Start camera" next to "Get started"). With a saved setup, Continue and "Set up again" both start it by design. On other stages with the camera off, the camera panel still offers it. |
| 1.5 | TEST | The start screen states what will happen and roughly how long ("about 1½ minutes"); the saved-setup text no longer claims Continue repeats the rest check when the saved setup has resting numbers. |
| 1.6 | TEST | "Use assisted input" and Helper settings are still present and unchanged in behaviour. |
| 1.7 | TEST | Every control on the start screen has an accessible name; the camera error text is in a `role=status`/`alert` element and focus stays on the retry button. |
| 1.7c | CHROME | New or changed text is at least 14px with 4.5:1 contrast (checked from computed styles in the running app). |
| 1.9 | TEST | Two synchronous clicks on Get started (or Get started plus Continue) call `tracker.start` once. |
| 1.10 | TEST | A rest check never starts if, by the time the camera is up, the user pressed "Use assisted input", the tracker reported an error, or the page unmounted. |
| 1.8 | TEST | tsc, the full vitest suite and the production build pass; existing tests change only where the old start path is intentionally replaced. Baseline: 363 tests. |
| 1.C | CHROME | At 1470x762 and 1280x720 the primary start action is fully visible without scrolling. |
| 1.H | HUMAN | With the real camera, one click on "Get started" asks for camera permission and the rest check begins by itself; a helper finds the start screen clear. |

### Slice 1 result (rounds: 2 of 3)
Software verified: 1.1-1.8, 1.9, 1.10 TEST PASS (24 acceptance tests; suite 387/387, tsc, build); 1.7c PASS (all start-screen text 14px, contrast 4.6-9.6); 1.C PASS at 1470x762 (1280x720 not tested: window could not be resized). Mutation checks: removing both in-flight guards fails 1.9; the post-await check in getStarted is redundant with startCamera's epoch check and the session's own refusal (defense in depth).
**Human acceptance pending:** 1.H (real camera: one click on Get started asks for permission and the rest check begins by itself; start screen is clear to a helper).

## Slice 2: one approve screen for a first movement (click-to-record and rename move to slice 3)

| ID | Tag | Criterion |
| --- | --- | --- |
| 2.1 | TEST | New setup with exactly one movement (no approved movements, not restoring, adding or recalibrating): after the checks pass, the comfort screen offers "Approve and practice", "Approve, but it takes effort", "Record again" and "Try another movement". The mapping and mapping-confirm screens never appear. |
| 2.2 | TEST | "Approve and practice" reaches `practice` with that one movement approved (select only), the cycle `approved`, effort recorded `easy`; "Approve, but it takes effort" does the same and records `effort`. |
| 2.3 | TEST | Nothing is approved or armed while the comfort screen is showing (`snapshot.approvedModels` empty, `mappingLabel` null, runtime not armed); only the two Approve decisions turn controls on; "Record again" and "Try another movement" approve nothing. |
| 2.4 | TEST | The screen states what will turn on (the controls label and automatic-scanning explanation) next to the checks passed, the accidental count and the "not a guarantee" note. |
| 2.5 | TEST | Counting selections with a synthetic stream: Get started, pick movement, Record, Approve = 4 to reach practice. Before this slice the same path was 6 (those four plus the Comfortable and mapping choices, with Approve after them). |
| 2.6 | TEST | Unchanged: adding a second movement, recalibration, restoring a saved setup and the saved-setup Continue still go through their existing screens and approve correctly (existing tests pass unmodified). |
| 2.7 | TEST | With the gesture scanner, the comfort decisions are scan targets and a first movement needs one scan selection to approve instead of three. |
| 2.9 | TEST | "Approve, but it takes effort" and "Approve and practice" both reach `practice` with either effort answer, and the controls shown in `comfortPreview` (computed before the click) equal the mapping actually applied; stubbing `recommendMapping` to return a different mapping changes neither. `this.proposals` and `this.recommendation` are unchanged by showing the comfort screen. |
| 2.10 | TEST | Refused approval is clean: with no verified cycle, the approve decision is not offered; a second call after approval is ignored; a refusal leaves `pendingMapping` null and records no effort. |
| 2.11 | TEST | The restoring, adding and recalibrating paths never offer the new ids. |
| 2.12 | TEST | The new decisions are scanned after "Record again" (not first), and the preview text is in a region referenced by `aria-describedby` on the decision list. |
| 2.8 | TEST | tsc, full vitest and build pass; Baseline for this slice: 387 tests. |
| 2.H | HUMAN | A helper reading the comfort screen understands exactly what "Approve and practice" will turn on. |

### Slice 2 result (round 1 of 3)
Software verified: 2.1-2.7, 2.9-2.12 PASS (25 acceptance tests), 2.8 PASS (tsc, 412 tests, build). Mutation checks: scan-order and adding/recalibrating guards are caught; the verified-cycle check and effort-independence mutants survive as equivalent (unreachable from the comfort stage; with one movement select-only is the only valid mapping), kept as defence in depth. Note: 2.3 "runtime not armed" is not asserted because the recognizer is armed on the comfort screen so decisions can be scanned; observable state and an accidental first movement approving nothing are asserted instead.
**Human acceptance pending:** 2.H (a helper reading the comfort screen understands what "Approve and practice" turns on).

## Slice 3: click a movement to record it; rename on the approve screen

| ID | Tag | Criterion |
| --- | --- | --- |
| 3.1 | TEST | Clicking a movement tile starts training immediately (stage `training`). The choose screen has no "Record this movement" button and no name field. |
| 3.2 | TEST | Tiles are disabled while the camera is not running; movements already in use stay disabled while adding. |
| 3.3 | TEST | The comfort screen for a first movement has a "Name this movement" field prefilled with the default label. Editing it and approving (with no blur between typing and approving) stores that label in `approvedModels`, the controls label, `diagnosticModel`, the evidence cycle's movement and the autosaved profile, all equal; the model id and thresholds are unchanged. |
| 3.4 | TEST | A blank name, one over 60 characters after trimming (a 60-character name plus surrounding spaces is accepted and stored trimmed), or a duplicate of an approved movement's label while adding is refused with a plain message and the last valid name is kept; renaming is refused outside the comfort stage, when restoring, and never approves anything. |
| 3.5 | TEST | "Record again" keeps the chosen name. |
| 3.6 | TEST | Counting selections with a synthetic stream: Get started, pick movement, Approve = 3 to reach practice. |
| 3.7 | TEST | The discovery path (choosing a noticed movement) and adding a second movement still start training and approve as before. |
| 3.8 | TEST | tsc, full vitest and build pass; baseline for this slice: 412 tests. |
| 3.H | HUMAN | A helper can pick a movement with one click and finds where to rename it. |

### Slice 3 result (round 1 of 3)
Software verified: 3.1-3.7 PASS (19 acceptance tests), 3.8 PASS (tsc, 431 tests, build). Mutations: partial rename, blur-only apply, no-trim and input remount are all caught; allowing rename while restoring survives as an equivalent mutant (`candidate` is null then). **Human acceptance pending:** 3.H.

# Branch ux-comm-screen: communication screen

Design: reasoning.md "UX comm screen". Mockup the user approved: https://claude.ai/artifact/W8t4tg1TKfoiHHrk9SZ4Cr. Baseline: 461 tests. QA owns `src/app/ux-comm.acceptance.test.ts` and `src/ux-comm-ui.acceptance.test.tsx`; the developer may not edit them.

| ID | Tag | Criterion |
| --- | --- | --- |
| C1 | TEST | Scan order in communication (gesture and assisted). Empty message: the 6 phrases, `repeat` only after something was spoken, `pause`, `helper`. With a message: `speak`, `undo`, the 6 phrases, `pause`, `helper`. No other control is in the top-level list. |
| C2 | TEST | With a synthetic gesture stream in automatic scanning: "Please help me" spoken in 2 selections (phrase, Speak); a 5-phrase message spoken in 6. After every communication selection the highlight is back on the first item. |
| C3 | TEST | Undo removes only the last phrase; it is not offered with an empty message; it never changes lastSpoken, scan speed, mapping or phrases. |
| C4 | TEST | "Say it again" is absent until something is spoken; it speaks exactly the last spoken text through the speech port, also after Clear, and leaves the message unchanged. |
| C5 | TEST | Clear is only in the Helper panel and only with a message. Selecting it shows `clear-no`, `clear-yes` in that order; Keep it leaves the message; Yes empties it. With the confirmation open, 5 minutes of scanner ticks discard nothing. |
| C6 | TEST | Selecting Helper opens the panel: `close-helper`, the controls (gesture: change-controls, add-movement below the limit, recalibrate, tiring with 2+ movements; assisted: use-gesture or setup-gesture), slower/faster when they apply today, clear (with a message), practice, pause. Opening and closing changes no setting (speed, mapping, phrases, message). Close returns to the C1 list. Slower/Faster keep the panel open. |
| C7 | TEST | A helper id selected while the panel is closed does nothing. From the panel, change-controls, add-movement, recalibrate, tiring and practice behave as before. |
| C8 | TEST | Pause works from the board and the panel, stops the highlight, and resumes by movement, Space or the button; message and panel state are kept through Pause, tracking loss and the step-idle fallback. A hold that started before the list changed selects nothing. |
| C9 | TEST | `movementSeen` is true within 1 s of a recognised movement in communication or practice and false after 1 s with none; always false in assisted mode. |
| C10 | TEST | UI: the message region comes before the phrase grid; Speak and Undo render only with a message; "Say it again" only after speaking; the Helper panel shows the "Your controls" group (Change controls, Add a movement, Recalibrate as tiles with descriptions) before "Scanning and message"; camera diagnostics and the signal dashboard are not rendered on the communication screen unless "Camera diagnostics" is opened in the panel; no beeps checkbox there; a "Movement seen" status exists. Practice shows Finish practice and no Helper. |
| C11 | TEST | Message text ≥ 24px and new text ≥ 14px (stylesheet checks); every control has an accessible name. |
| C12 | CHROME | Assisted mode at 1470×762 and 1280×720: message bar, Speak (with a message), all 6 tiles, Pause and Helper visible without scrolling; at 390×844 the message bar and Speak are visible without scrolling. |
| C13 | TEST | tsc, full vitest and build pass; existing tests change only to open Helper before a moved control, or because Speak now empties the message (C15). |
| C15 | TEST | Speak moves the message to lastSpoken and empties it, with or without a local voice (the text stays visible as last spoken). Choosing Change controls from the panel leaves the mapping decisions in the scan list (no communication list overwrites another stage). |
| C16 | TEST | Focus: opening Helper focuses the panel heading; Close helper returns focus to the Helper button; the Clear confirmation focuses its question; Keep it and Yes return focus to the Helper button. |
| C14 | TEST | The saved profile never contains the message, lastSpoken or panel state. |
| CH | HUMAN | With a real camera: the screen is easy to follow, the Movement seen light matches the movement, and a helper finds the options. |

### Result (round 1 of 3)
Software verified: C1-C11, C13-C16 PASS (51 acceptance tests: 40 session, 11 UI); C12 PASS in assisted mode at 1470×762, 1280×720 and 390×844 (QA screenshots, same-origin frames; camera never started). Coordinator rerun: vitest 36 files/513 PASS, tsc clean, build OK. Mutations caught: refresh without stage/scanner guard, Yes before Keep it, Undo clearing everything, no scan-list guard, no focus on open. Developer deviations accepted: diagnostics toggle is a button with `aria-expanded`; the no-voice note is in the Helper panel; Harness gesture selections open Helper for a moved control (C5/C7 use `selectTarget` directly). Not clicked in the browser: "Done, back to start screen" from the panel (covered by existing App tests). **Human acceptance pending:** CH.

# Branch ux-simplify, slice A: one setup screen, plainer copy

Design: reasoning.md "UX simplify, slice A". Baseline 513 tests. QA owns `src/ux-simplify.acceptance.test.tsx`; the developer may not edit it.

| ID | Tag | Criterion |
| --- | --- | --- |
| U1 | TEST | No setup screen shows "STEP" or the old 3-step stepper. Where the bar is shown (reasoning.md slice A revision 2, B1) it lists the flow's segments (Rest, Movement, Record, Checks, Everyday, Approve; adding: no Rest; restoring: Rest, Re-check, Everyday, Approve) with at most one `aria-current="step"`; it is hidden on tiring, recalibrate-confirm and Change controls mapping/confirm. |
| U2 | TEST | `setupProgress` unit tests cover the whole table: every stage × flow (first, add, recalibrate, restoring, quick restore straight to Approve) and every failure kind; passed segments carry no "done" claim. |
| U3 | TEST | No setup screen text, evidence details included, matches `/armed|interruptions|restarts|×\s*rest|Saved profile/i`. With interruptions > 0 the capture screen says "Paused N time(s) because your face wasn't clear"; "Communication is off while recording." stays. |
| U4 | TEST | Choose: the lead is one sentence; each tile has a signal meter with an accessible label (none yet when no signal; none < 1.5; some 1.5 to < 3; strong ≥ 3, boundaries tested) and "Seen now" at ≥ 3; no rhythm, "Next:" or head-direction developer paragraphs; clicking a tile still starts training. |
| U5 | TEST | Setup failed, for every failure kind: reasons shown; exactly one primary action (record-again, else Redo rest for baseline, Look again for discovery, else another movement); no paragraph listing the options. |
| U6 | TEST | Mapping: each proposal is a card with a mode heading and one chip per movement; "Recommended" and "In use now" badges match `recommendation` and the current mapping; card ids and scan order equal the previous decision order; Keep current setup is not primary. |
| U7 | TEST | Practice shows "Practice · nothing is spoken" and a "Start talking" button that finishes practice. |
| U8 | TEST | Setup camera panel: diagnostics and signal dashboard hidden until "Details" is expanded (`aria-expanded` false → true); beeps toggle visible on capture stages. |
| U9 | TEST | Every setup stage lead is at most 140 characters. |
| U10 | TEST | Failure reasons, accidental-selection counts with the observation disclaimer, and "nothing turns on until you approve" wording are still present where they were. |
| U11 | TEST | tsc, full vitest and build pass; existing tests change only for removed copy, the removed stepper, or renamed labels ("Start talking"). |
| U12 | TEST | Accessible names on every control; new text ≥ 14px (stylesheet checks). |
| UH | HUMAN | With the camera: setup feels like one flow, the progress bar matches what you are doing, the signal meter and "Seen now" help pick a movement. |

### Slice A result (round 1 of 3)
Software verified: U1-U12 PASS (57 acceptance tests plus 24 `progress.ts` unit tests). Coordinator rerun: vitest 38 files/595 PASS, tsc clean. QA: build OK; out-of-list edits (capture.ts, CameraDiagnostics.tsx, session.ts strings) are wording plus the additive `proposals` field; edits to existing tests follow removed or renamed copy only. Mutations caught: Rest current on quick restore, two primaries on failure, "armed" in evidence, diagnostics always shown, cards out of scan order (after QA strengthened that test). Accepted deviation: `record-again` is never primary, so Approve is primary on the comfort screen; scan order unchanged. **Human acceptance pending:** UH.

# Branch ux-simplify, slice B: one Approve screen; Recalibrate and Tiring inside Helper

Design: reasoning.md "UX simplify, slice B". Baseline 595 tests. QA owns `src/app/ux-approve-all.acceptance.test.ts`.

| ID | Tag | Criterion |
| --- | --- | --- |
| V1 | TEST | Adding a second movement: after the checks, the comfort screen offers `record-again`, `approve-comfortable`, `effort-choose`, `choose-different`, `another-movement`, `keep-current` in that order (no `approve-effort` with 2+ movements); Approve turns on exactly the previewed controls and reaches practice with no mapping or confirm screen. Recalibrate: same flow; with 2+ approved movements the card says the others will be turned off. One movement: the slice 2 list is unchanged. |
| V2 | TEST | The preview equals the approved mapping even when notes or tiring reports change between showing and approving; computing the preview writes no session state (proposals and recommendation unchanged). |
| V3 | TEST | `effort-choose` records effort "effort" and opens the cards with a recommendation that leaves that movement unused; `choose-different` records no effort and opens the cards; nothing is armed until a card is confirmed. Any refused approval announces a plain reason. |
| V4 | TEST | Continue with a full re-check: the comfort screen offers `choose-different`, `approve-saved`, `another-movement` in that order, so the first item arms nothing (no `reject-profile`); approve-saved arms the saved controls; an invalid saved mapping opens mapping instead; an unverified or partial restore still cannot arm. Quick restore still goes straight to the confirm screen. |
| V5 | TEST | Helper Recalibrate shows `recalibrate-no`, `recalibrate-yes` (No first) with no stage change; No returns to the panel with nothing changed; Yes starts the rest check with `recalibrating` true; with the camera off, Yes changes nothing (no flags, stays in the panel, plain message). The state resets on Close helper, entering communication and back to start; it survives Pause, tracking loss and the step-idle fallback. |
| V6 | TEST | Helper no longer lists `tiring`. Change controls with 2+ movements lists `report-tiring` after the proposals; it opens the tiring stage; choosing a movement returns to mapping with the recommendation updated; never-mind returns to mapping. With 1 movement, no `report-tiring`. |
| V7 | TEST | First accidental selection safety: `record-again` first on every fresh-movement comfort list, `choose-different` first on the restore comfort list; `recalibrate-no` first; `keep-current` first on Change controls (unchanged). |
| V8 | TEST | UI: comfort shows the controls card (mode heading + chips) for first, add, recalibrate and restore; the Helper recalibrate confirmation shows its one-line warning and moves focus to the question; no page titled "Recalibrate" remains. |
| V9 | TEST | tsc, full vitest and build pass; existing tests change only where the comfort → mapping → confirm path, the recalibrate-confirm stage or the Helper tiring item is intentionally replaced. |
| V10 | TEST | Nothing new is stored in profiles; effort/tiring notes behave as before for recommendations (scoring tests unchanged). |
| VH | HUMAN | With the camera: adding a movement or continuing goes straight from "how does it feel" to practice, and recalibrating from Helper is clear. |

### Slice B result (round 1 of 3)
Software verified: V1-V10 PASS (43 acceptance tests in `ux-approve-all.acceptance.test.ts`). Coordinator rerun: vitest 39 files/638 PASS, tsc clean; QA: build OK. QA diff review: the developer's edits to older acceptance tests (2.4, 2.6, 2.11, 3.7, C6, C7, C15) follow the replaced path and are not weaker. Mutations caught: preview effort differing from approval, `approve-saved` first, `recalibrating` set before the camera check, never-mind returning to communication, approve-effort with 2+ movements. Equivalent mutant: skipping the verified-cycle check in `comfortProposal` (comfort is reachable only after a verified cycle; `approveMapping` still guards). Safety fix found by QA: the restore comfort list starts with `choose-different`, so the first item arms nothing. **Not observed in a browser:** the Helper → Recalibrate confirmation (needs the camera). **Human acceptance pending:** VH.

# Merge of main into ux-simplify (R18): combined talking screen

Design: reasoning.md R18. Baselines: ux-simplify 638 tests, main 857. QA owns `src/app/ux-merge.acceptance.test.ts` and may edit `ux-comm.acceptance.test.ts` / `ux-comm-ui.acceptance.test.tsx` to the combined contract; the developer may not edit QA files, and edits main's tests only for replaced behaviour.

| ID | Tag | Criterion |
| --- | --- | --- |
| M1 | TEST | Top list: `speak`, `undo`, group tiles, `pause`, `more`, identical with an empty or non-empty message and before/after speaking. Group list: phrases, `back`, `pause`. |
| M2 | TEST | Helper level (`more`): label "Helper" on the tile; list = `clear`, `save-favourite`, `say-again`, slower/faster (as today), `practice`, `change-controls`, `add-movement` (< MAX), `recalibrate`, `back` ("Close helper"), `pause`; no `tiring`; assisted variant has `use-gesture`/`setup-gesture`. |
| M3 | TEST | Clear: selecting `clear` opens a level whose list starts `clear-no`, `clear-yes`, `pause`; Keep it keeps the message; Yes empties it; two idle wraps return to the main list with the message kept; derived `confirmingClear` is true only in that level. |
| M4 | TEST | Recalibrate: selecting `recalibrate` opens `recalibrate-no`, `recalibrate-yes`, `pause`; No returns to the Helper level unchanged; Yes with the camera running starts the rest check (`recalibrating` true); with the camera off it changes nothing and returns to the Helper level with a plain message; auto-return changes nothing. |
| M5 | TEST | Speak moves the message into `lastSpoken` and empties it; `say-again` repeats exactly `lastSpoken` (also after Clear) and changes nothing else; Undo removes only the last phrase; counts: Favourites tile → phrase → Speak is 3 selections, and the highlight returns to Speak after a phrase. |
| M6 | TEST | Favourites flow from main still works end to end (save-favourite → confirm → saved with the Last setup; cancel; auto-return "Not saved"); phrase editing, vocabulary persistence and Continue restoring phrases still pass main's existing tests. |
| M7 | TEST | Pause is in every level; a hold begun before any level swap selects nothing; message, level and favourites survive Pause, tracking loss and the step-idle fallback (which returns to the main list). |
| M8 | TEST | Slice A/B behaviour intact: progress bar, proposal cards, comfort approve lists (including `choose-different` first on restore), `effort-choose`, Change controls `report-tiring`, "Start talking"; their acceptance tests pass unchanged except for list/ids replaced by M1-M2. |
| M9 | TEST | UI: the message bar precedes the grid; Speak/Undo always present; "Say it again" button only when the message is empty and something was spoken; the Helper panel shows "Your controls" tiles first, then buttons, then the click-only sections (Jump to a phrase group, Edit phrases, Camera diagnostics, Setup evidence); main's group tabs and operation toolbar are not on the main screen; diagnostics hidden until opened; Movement seen status present; focus rules (heading on open, Helper button on close, question on confirm). |
| M10 | TEST | Caregiver route `#/caregiver`, Root/care client and Supabase config tests pass unchanged; no `.env*` file or key appears in `git diff` of the merge commit(s). |
| M11 | TEST | tsc, full vitest (main's tests plus mine) and build pass. Test changes are limited to replaced behaviour, each listed. |
| M12 | CHROME | Assisted mode at 1470×762 and 1280×720: message bar, Speak, Undo, the 3 group tiles, Pause and Helper are visible without scrolling; at 390×844 the bar and Speak are visible. Open Helper and a group once. |
| MH | HUMAN | With a real camera: the combined talking screen reads clearly and scanning through Favourites/Quick/Needs, Helper and Clear feels right. |
