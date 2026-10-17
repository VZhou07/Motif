# Motif build update

**Works now (in automated tests):** a person rests for 10 seconds, picks a comfortable movement, practices it, passes separate checks and an "everyday activity" check, then approves it. After that, the movement alone can pick phrases, build a message, speak it, pause, change speed and recalibrate. If the face is lost or the tab is hidden, nothing gets selected. A Space-bar mode exists for people who can't use a face movement. A browser test with a fake test camera passes.

**Half done:** using two to four movements together (for example one moves to the next item and one selects). The main logic and screens are in place, but the tests and the independent review for it are still to do.

**Next:** finish those tests and the review, then saved profiles, scoring, movement discovery, and final polish.

**Still needs a person:** the camera is covered, so real face tracking, comfort, spoken audio and hands-free use have not been tried by a human yet.

Saved work is split into many small commits. Exact restart steps are in `progress.md`.
