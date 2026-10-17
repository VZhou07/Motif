# UX acceptance (branch ux-setup-flow)

Tags: TEST = automated, CHROME = observed in the running app (assisted mode, camera covered), HUMAN = needs a person or camera. Only HUMAN items may use subjective wording. QA owns `src/app/ux-setup.acceptance.test.ts`; the developer may not edit it.

## Slice 1: Get started, start-screen copy, overview

| ID | Tag | Criterion |
| --- | --- | --- |
| 1.1 | TEST | With no saved setup the start screen has one primary button "Get started". Clicking it starts the tracker and, once the camera is running, the session reaches `baseline` with no further click. |
| 1.2 | TEST | If the camera fails to start, the stage stays `welcome`, no rest check starts, the camera error is shown and "Retry camera" is offered. |
| 1.3 | TEST | With a saved setup, "Continue with your last setup" stays primary and "Set up again" is a secondary control that starts the camera and then the rest check without restoring anything. |
| 1.4 | TEST | On the start screen exactly one control starts the camera (no second "Start camera" next to "Get started"). On other stages with the camera off, the camera panel still offers it. |
| 1.5 | TEST | The start screen states what will happen and roughly how long ("about 1½ minutes"); the saved-setup text no longer claims Continue repeats the rest check when the saved setup has resting numbers. |
| 1.6 | TEST | "Use assisted input" and Helper settings are still present and unchanged in behaviour. |
| 1.7 | TEST | Any new or changed text is at least 14px with 4.5:1 contrast; every control has an accessible name. |
| 1.8 | TEST | tsc, the full vitest suite and the production build pass; existing tests change only where the old start path is intentionally replaced. Baseline: 363 tests. |
| 1.C | CHROME | At 1470x762 and 1280x720 the primary start action is fully visible without scrolling. |
| 1.H | HUMAN | With the real camera, one click on "Get started" asks for camera permission and the rest check begins by itself; a helper finds the start screen clear. |
