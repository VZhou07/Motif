# UX notes (branch ux-setup-flow)

## What changed and why it helps
- **One "Get started" button.** Camera and rest check start together; fewer steps for someone who tires quickly and for a helper. Protected against double clicks and against starting after the user left.
- **One approve screen for a first movement.** After the checks pass, "Approve and practice" replaces three screens (comfort, mapping, confirm). Same checks, same approval rule; the screen says what will turn on. Scan order puts Record again first so one accidental movement cannot arm controls.
- **Click a movement to record it; rename on the approve screen.** The Record button and name box are gone from the choose screen. The name is applied as typed, so it is never lost.
- **Saved setup:** "Continue" skips the rest check when resting numbers were saved; start-screen text is now 14px or larger.
- Selections from launch to the practice board: 8 before, 4 now (Get started, pick movement, Approve, Finish practice).

## What stays the same
Rest, training, verification and everyday-activity checks and thresholds; the approval requirement; local-only video; no medical claims.

## Remaining (not done on this branch)
- Human checks: real-camera Get started (1.H), approve screen clarity (2.H), one-click movement pick and rename (3.H).
- 1280x720 layout not measured (tool could not resize).
- Communication screen redesign (message bar, Undo, Repeat, Helper panel, diagnostics dropdown) is the next branch, `ux-comm-screen`.
- Two-or-more movement approval is still the longer path (comfort, mapping, confirm).

## Demo checklist (setup)
1. Fresh browser: click Get started, allow camera, wait for the rest check (no extra click).
2. Click one movement tile; hold it on Action cues.
3. On the approve screen, rename it, then click Approve and practice.
4. Refresh the page: Continue goes straight to approving the saved controls.
