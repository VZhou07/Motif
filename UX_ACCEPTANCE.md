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
