# Motif build update

The head/mouth conflict fix is ready to try at **http://127.0.0.1:5187/**. It runs separately on `fix/gesture-conflicts`; Grok's checkout and your teammate's communication screen were left untouched.

A clear movement can now work alongside small incidental movement. Two gestures reaching their action thresholds together still cancel input. Rest shows and optionally speaks the movement needed for the next Action, including after an interrupted attempt. Failed checks explain whether the movement was missed, repeated, confused with another, or actually ambiguous, with measured values.

Calibration still uses **5 seconds Rest / 5 seconds Action**, with the existing low/high beeps. No new communication buttons were added.

Independent checks passed: **378 tests, typecheck, production build, and 67 fake-camera browser checks**. Tests reproduce mouth with tilt down and turn right, use them for separate existing controls, and reject actual simultaneous activation.

**Still needs your try:** real mouth/head calibration, comfortable timing, direction labels, and audible cues. No real camera was opened during these checks. See `ACCEPTANCE.md` 6.6.

The changes are committed locally in the separate branch. Nothing was merged or pushed.
