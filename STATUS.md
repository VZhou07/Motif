# Motif build update

**Changed for you:**
- **Close left/right eye** now means one eye; a two-eye blink should not fire it.
- Other movements learn from a clear hold of about **0.6 seconds**.
- Your setup saves automatically. **Done, back to start screen** (on the message screen, and inside assisted input) ends the session.
- **Continue with your last setup** skips only checks that passed within the last hour; older ones run again. **Continue and re-check my movement** always checks everything. A failed restore makes the next Continue check everything. Confirming the controls is always asked.

**Checked (automated):** typecheck PASS; 393 tests PASS; production build PASS. Designs and the merge reviewed and tested independently.

Camera processing stays on this computer. Saved data: movement settings, controls, phrases, scan speed, resting summary numbers and when checks passed; never video or messages. Profiles saved before the eye change ask you to set up again.

**Still needs a person:** real face tracking, blink vs one-eye, short holds, comfort, beeps, hands-free use, and Continue within and after an hour. Nothing has been pushed.
