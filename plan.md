# MOTIF — Adaptive AI Accessibility Interface

## Vision and product contract

Motif adapts computer interaction to movements a person can comfortably and repeatedly perform. A pretrained MediaPipe Face Landmarker supplies facial features; personalized signal processing and recognition turn verified movements into an approved control scheme. This is a real, browser-local assistive interaction prototype for a 36-hour AI for Social Impact hackathon, not a chatbot, simulated demo, medical device, or emergency detector.

The full experience is: observe rest → discover candidate movements → repeat and verify → review/approve mapping → practice → communicate through speech and message composition → recalibrate/remap as needed. No required smile, blink, head motion, speech, mouse, or keyboard ability is assumed after calibration. Free discovery alone never establishes intentional control.

## Decisions and authorization

| Item | Decision / status |
| --- | --- |
| Repository | Inspected: only README and initial Git commit existed. No existing application to preserve. |
| Stack | User specified React, TypeScript, Vite, Tailwind, MediaPipe Face Landmarker, Vitest, browser SpeechSynthesis; no backend. |
| Current scope | User approved UA1: full P0, then all P1 in the recorded order, followed by software/demo hardening. A later explicit `build` instruction starts the persistent Goal; this readiness task does not start application work. |
| Build started | User explicitly said `build`. Goal is active; proceed without asking the sleeping user questions. Camera is covered; no unattended real-person camera test. Keep `STATUS.md` brief/plain and `progress.md` precise for resume after agent failure or credit/runtime interruption. |
| Presentation | User selected a calm, high-contrast communication screen with expandable developer dashboard. |
| Commit policy | UA3 approved local checkpoint commits during the build after required automated checks and independent review; short subject only, no body/trailers/coauthor attribution. Use existing author identity; if absent, record and leave uncommitted. Never push. Later user instruction: commit more often in small focused chunks once their tests/typecheck pass; reviews still gate checkpoints. |
| Checkpoint skill | User approved adding `motif-checkpoint` for Codex and Claude Code. Canonical procedure in `.agents/skills/motif-checkpoint/SKILL.md`; Claude adapter in `.claude/skills/motif-checkpoint/SKILL.md`; startup/delegation instructions explicitly require reading it. UA1–UA3 below supply product/build authorization; skill setup alone does not. |
| Camera privacy | Local inference, no uploaded or persisted video; self-host the model and matching WASM assets. Initial development downloads assets, not user data. |
| Supported device/language | UA2 approved English desktop Chrome/Edge with webcam, localhost/HTTPS, one calibrated person in view; no mobile/Safari guarantee. |
| Onboarding | UA2 approved optional caregiver/mouse/keyboard assistance before calibration and timed spoken/visual prompts. Fully independent first-run onboarding is outside this build. Operational decisions after successful calibration remain gesture-operable. |
| Calibration | UA2 approved approximately 10 valid seconds of rest, three training repetitions separated by rest, two held-out repetitions, a neutral-armed 10-second negative activity window, and explicit comfort confirmation. Durations count valid fresh input only; exact robust timing/signal parameters remain reviewed engineering choices. |
| Timing follow-up | User then asked to drop Return to rest / Get ready, use only Rest and Action at five seconds each, add Rest↔Action beeps, and show a camera overlay of why calibration fails. R13 revision 2 independently approved and software-verified. Human comfort, beep audibility and real-camera diagnosis remain pending. Overall build Goal stays paused. |
| Blink / hold follow-up | User then asked that a blink must not fire Close one eye, and that movements other than Open mouth must calibrate from a short comfortable hold. R14 revision 2 independently approved and software-verified (wink channels, 500 ms wink dwell, 600 ms peak hold in Action). Real-camera wink/hold success remains pending. |
| First recognizer | Choose any available signed facial feature, including eyebrows, eyes, mouth, or head orientation. Fit personalized thresholds and reject poor separation. No global expression threshold defines the gesture. |
| Communication | (C1/R18, numbered R14 on ethan-features; user scope change 2026-10-17, supersedes the flat six-phrase list once reached: grouped phrases, Favourites, Undo, Say again.) UA2 approved six common phrases, optionally edited conventionally during setup; gesture selection appends to composition with separate Speak/Clear. No gesture spelling keyboard or prediction in this MVP. Start scanning at 2 seconds; speed, practice, Pause/Resume, and recalibration decisions remain gesture-operable. |
| Speech | UA2 approved optional local spoken prompts and only voices marked local. If none is available, keep visible communication text and explain the local-speech limitation. No remote voice fallback. |
| Storage | First slice stays in memory. UA1/UA2 approve minimal versioned local profiles in P1 with opt-in Save, named selection, Delete, rest/revalidation, and mapping confirmation before arming. Deliberately saved phrase vocabulary is profile settings; draft messages/history and video are never saved. |

UA1–UA3 are approved; no further product decisions are open for the selected scope. Implement incrementally through the approved checkpoints after the user's later `build` instruction. Routine engineering choices are delegated to the agents, documented, and independently reviewed; changes outside the approved scope need separate authorization.

## First vertical slice

Deliver a runnable application in which a real webcam supplies live numerical facial signals, a person records a resting baseline and repeated comfortable movement, the system learns one gesture from that person's data, the person verifies it and approves its mapping, and that gesture selects a real communication action through automatic scanning. No fake recognizer or injected feature stream appears in the demo path.

Calibration must reject insufficient data or overlapping neutral/gesture distributions. Separate held-out attempts and negative activity must pass before approval is available. Display counts and observed false activations, never a fabricated accuracy percentage. A failed candidate offers retry, another movement, or assisted input.

The first slice is a step toward P0, not completion of the whole MVP. Continue afterward to two independently verified gestures and multi-gesture mappings, then the approved P1 features. Discovery and profile persistence stay outside the first slice but inside the full build. Template matching and prediction remain excluded P2 work.

## Typed module boundaries

| Module | Responsibility and boundary |
| --- | --- |
| Face Tracker | Camera lifecycle and MediaPipe inference → timestamped frame with features and tracking validity. Mirrored preview only; left/right mean the person's anatomical sides. Detect multi-face input and fail closed. |
| Feature Processor | Time-based smoothing, finite-value checks, normalization, head orientation, baseline center/noise statistics. No browser dependencies in numeric processing. |
| Discovery Engine | Later: propose correlated, distinct movement candidates and descriptive labels; never approve them automatically. |
| Calibration Engine | Baseline + labeled rest/movement training trials → thresholds and quality rejection. Held-out trials never change fitted parameters. |
| Recognition Engine | Processed frame + calibrated gesture(s) → neutral/active/uncertain observation; recognition alone performs no UI action. |
| Control Mapper | Verified gestures + effort/preferences → reviewable mappings; only explicitly approved mappings arm control. |
| Input State Machine | Observations + monotonic timestamps + safety state → at most one action per hold after neutral rearm. Tracking loss/gaps/ambiguity/pause reset pending events. |
| Accessible UI | Deterministic scan/selection, practice, phrase composition, speech, pause/resume, and recalibration. Accessible names, large targets, focus feedback, reduced motion, visual and optional spoken prompts. |
| Profile Storage | Later: validate versioned minimal local calibration data; support delete/restore and require rest check before rearming. Never retain video. |

Use pure TypeScript functions/classes for numerical and control logic. React owns presentation and orchestration. Browser camera/speech adapters remain replaceable and testable. Add future module implementations when needed, not placeholder success paths.

## Safety invariants

- Communication actions remain disabled until calibration passes, comfort is confirmed, and the mapping is approved. After verification, the recognizer may operate a restricted setup scanner for Comfortable / Retry / Approve / Reject so approval itself does not require a mouse or keyboard. This scanner cannot speak messages or execute communication actions. Reset neutral state on every phase transition.
- Use personalized activation/release thresholds, time-based smoothing, activation dwell, release dwell, and return to neutral before each new activation. Never adapt thresholds silently during use.
- Invalid/nonfinite/missing signals, stale/nonmonotonic time, tracking dropout, multiple faces, large frame gaps, ambiguity, or a hidden tab produce no action; discard pending activation and require fresh neutral after recovery.
- A paused scan cannot select a phrase. The same gesture can resume after fresh neutral; Pause is reachable through scanning. Freeze/reset scan timing on loss; do not apply catch-up selections.
- At gesture activation-dwell onset, latch the highlighted item and freeze scan advancement until the dwell either completes or cancels. Selection applies to that latched item; invalid/uncertain/canceled input discards the latch. Reset the scan deadline afterward. Test a gesture whose dwell spans a normal scan boundary.
- A user can practice without speech. Provide local text feedback if speech is unavailable. No claim that facial model scores prove intention.

## Checkpoints / waypoints

Check a waypoint only when all its required acceptance criteria are met. Record software checks and human/hardware acceptance separately in `reasoning.md` and `progress.md`. If software dependencies pass but manual evidence is unavailable, leave the overall checkbox open, record `software verified; human acceptance pending`, and continue independent authorized software work. Actual failures block affected dependencies. Independent testing subagents inspect and run relevant checks themselves. Hours are a suggested hackathon budget, not a promise.

- [x] **W0 — Inspect and define scope (hours 0–2).** Inspect repository, write planning/rules/reasoning/progress, record user decisions and open proposals. Reached when documents exist and accurately represent the request; implementation authorization is separately recorded.
- [x] **W1 — Review design and approve build contract.** Reached: R1 design and R3 contract independently reviewed; user approved UA1–UA3; final cross-document review/testing passed. Application implementation waits only for the later explicit `build` instruction.
- [ ] **W2 — Runnable camera and signal dashboard (hours 2–6).** React/TS/Vite/Tailwind scaffold; pinned dependencies; local MediaPipe model/WASM setup; explicit camera permission; camera stop/retry; actual facial features and anatomical labels. Build/typecheck pass; adapter extraction tests cover missing/multiple faces and invalid signals. Record real-camera manual verification separately.
- [ ] **W3 — Personalized baseline and one gesture (hours 6–12).** 10 usable seconds of rest, robust noise statistics, time-based smoothing; signed feature choice; three training repetitions separated by neutral; learned activation/release thresholds; held-out two-attempt and negative-window verification; comfort confirmation; rejection/retry. Unit tests cover noise, weak movement, fit/validation separation, tracking gaps, activation/release, brief spikes, sustained holds, and rearming.
- [ ] **W4 — Real gesture controls communication (hours 12–17).** Explicit mapping approval; practice; one-switch scanning; compose/speak/clear; editable phrase set; Pause/Resume/Recalibrate usable with one gesture. Unit/integration tests cover scanner boundaries, duplicate prevention, tracking loss, pause/resume, and calibration-to-action through simulated inputs; final application path remains real camera only. Typecheck and production build pass.
- [ ] **W5 — First-slice verification and handoff.** Independent implementation review, full unit/integration suite, build, and applicable browser smoke checks pass; record real-webcam criteria as observed results or pending. Do not call hardware behavior verified without observing it. Continue the approved remaining scope after software dependencies pass; a pending human demo does not end the run.

Status 2026-10-17 (session 2): W2–W5 are **software verified; human acceptance pending** (independent `w2_w4_recheck` PASS; 103 tests, typecheck, build, 12/12 fake-camera browser checks). Boxes stay open until a person verifies the real webcam flow.
- [ ] **W6 — Complete remaining P0 (hours 17–24; authorized by UA1).** Verify at least two different gestures, distinguish ambiguous/conflicting activation, and review explicit two-gesture Next/Select and 3+ gesture mappings. Preserve one-gesture fallback and zero-gesture assisted/alternative-input path. All operational controls remain reachable. Run independent reasoning reviews, regression, and full flow tests after each addition; no renewed product approval is needed.
  Status 2026-10-17 (session 3): **software verified; human acceptance pending** — R6 revision 2 approved; independent `w6_test_review` re-check PASS at `e848456` (134 tests, typecheck, build, 12/12 fake-camera browser checks). Box stays open until a person verifies multiple real movements.
- [ ] **W7 — Complete all P1 differentiators (hours 24–31; authorized by UA1).** Complete W7a–W7c in order, reviewing/testing each feature separately. No further prioritization meeting is required.
  Status 2026-10-17 (session 3): W7a–W7c all **software verified; human acceptance pending**.
- [ ] **W7a — Local profiles and recalibration.** Opt-in minimal profiles with saved phrase settings, consent/delete/version validation, disarmed restore/revalidation, and gesture-accessible recalibration/remapping with cancel/keep-old and assisted recovery.
  Status 2026-10-17 (session 3): **software verified; human acceptance pending** — R7 revision 2 approved; independent `w7a_test_review` re-check PASS at `fa56d76` (212 tests, typecheck, build, 12/12 fake-camera browser checks). A person still needs to save, reload and restore with a real camera.
- [ ] **W7b — Observed scores and mapping recommendations.** Report actual trial/rest evidence and user effort/comfort; recommend editable gesture mappings and require explicit in-app approval. No claimed medical or population accuracy.
  Status 2026-10-17 (session 3): **software verified; human acceptance pending** — R8 revision 2 approved; independent `w7b_test_review` re-check PASS at `5464487` (243 tests, typecheck, build, 12/12 browser checks). A person still needs to rate effort, report tiring and judge the recommendations.
- [ ] **W7c — Free movement discovery.** Detect meaningful deviations, group correlated signals, label candidate motions, and require deliberate independent verification before a candidate may control communication. Discovery never bypasses training/validation/approval.
  Status 2026-10-17 (session 3): **software verified; human acceptance pending** — R9 revision 2 approved; independent `w7c_test_review` re-check PASS at `fefa186` (263 tests, typecheck, build, 12/12 browser checks). A person still needs to explore freely with a real camera and judge the suggestions.
- [ ] **W8 — Demo and accessibility hardening (hours 31–36).** Demo Person A and B with different gestures without code changes, plus one-gesture fallback. Check permission errors, zero gestures, tracking loss, noisy lighting, reload, speech absence, comfort/fatigue, keyboard focus, contrast, and reduced motion. Document supported environment and limitations. User owns push/deployment.
  Status 2026-10-17 (session 3): **software verified; human acceptance pending** — R10 revisions 2–3 approved; independent `w8_test_review` re-check PASS at `8f22174` (276 tests, typecheck, build, 67/67 fake-camera browser checks). Includes a privacy fix: MediaPipe's built-in usage logging is now blocked. README documents the environment and limits; ACCEPTANCE.md is the manual checklist.
- [ ] **W9 — P2 only if separately approved.** Multivariate templates/DTW, explicitly confirmed online adaptation, predictive communication, external browser/OS controls. No large model trained from scratch; no automatic emergency/medical detection.

- [ ] **T1 — Calibration timing follow-up (R11).** Predictable ready/move/relax cadence, advance warning, recorder-owned countdown and coherent phase cues. Preserve personalized fitting and independent verification. **Software verified; human pacing/comfort pending:** R11 approved by timing_review; timing_tests independently passed 294 tests, typecheck and build; coordinator passed 67/67 fake-camera browser checks. Box stays open until a person tries the rhythm.

- [ ] **T2 — Return-to-rest rejection fix (R12).** User-reported failure supersedes ideal-stream acceptance: allow bounded personal relaxed variation after a quiet baseline and assess the fixed settled tail of gradual return. Reject large held residuals; preserve frozen held-out and negative checks. **Software verified; real-person calibration/comfort pending:** R12 revision 2 approved by rest_review; rest_tests independently passed 321 tests/typecheck/build and checked five bad alternatives; coordinator passed 67/67 browser checks. Original failing scenarios now pass. Keep box open until ACCEPTANCE.md 3.6 is observed.

- [ ] **C1 — Communication navigation and saved phrases (R18; numbered R14 on ethan-features).** Scope change approved by the user 2026-10-17. Grouped two-level scanning (Speak · Undo · groups · Pause · More) with Back and Pause in every level and auto-return after two idle passes; helper-editable phrase groups (Favourites + up to 5 groups, 12 phrases each); Undo last, Say again, and a scanned "Save to Favourites" confirmation that adds the current message to the vocabulary. Favourites persist through the automatic Last setup once a movement setup is approved (R19, after merging main; profile version 2, version 1 migrated on read); messages and last-spoken text are never stored. Excluded: spelling keyboard, prediction, gesture-driven phrase deletion/reordering, P2. **State: software verified; human acceptance pending** (ACCEPTANCE.md C1.1–C1.9). Built `ed6707a..79c0321`; independent c1_testing review BLOCKING (two untested resets) → tests added → re-check PASS. tsc PASS, vitest 36 files/478 PASS, build PASS, browser-check 83/83. Box stays open until a person completes C1.1–C1.9.

## Validation strategy

Use Vitest simulated timestamped feature streams to verify numerical processing, calibration, recognition, input safety, and scan integration. Test missed gestures and false activations independently; include signal drift/noise, brief spikes, long holds, rest return, invalid/missing values, low frame rate/gaps, tracking loss/recovery, phase changes, approval without conventional input, gesture dwell spanning a scan boundary, and pause/resume. The negative ordinary-activity window begins only after a verified fresh-neutral dwell has armed the recognizer; interruptions restart or fail it. Report evaluated duration and event count. Use fake clocks for timing; do not rely on a webcam for unit tests. Each implemented feature gets relevant unit and integration checks before its waypoint advances.

For integration checkpoints run `npm test`, `npm run typecheck`, and `npm run build`. Manual hardware acceptance: allow camera → verify live values → rest → train one comfortable movement → pass held-out/negative tests → approve mapping → select/compose/speak using only gesture → pause/resume/recalibrate → lose/recover tracking without an action. Inspect browser network/storage for no camera upload or video persistence. Record actual browser, device, and results.

## Resumable workflow

`progress.md` is the handoff contract. Every active task records owner, owned files, reviewed reasoning revision, last passing state, partial changes, exact checks and results, pending failures/manual validation, and the next ordered steps. Update it before a worker starts a chunk and whenever that chunk changes state. A replacement must inspect the real Git diff and unfinished processes before adopting the task; ownership transfers before editing. Resume the first actionable unmet criterion under the software/human gate distinction rather than restarting all work; preserve unavailable manual criteria as pending. Any changed design receives fresh reasoning review; every completed feature receives an independent test review. Review and tests are release gates, not a guarantee that software has no bugs. Failed checks keep the waypoint incomplete.

Workflow setup checkpoint (separate from product W1):

- [x] **WF1 — Add checkpoint skill.** Reached: independent R2 design approval; canonical Codex skill and Claude adapter written; root rules/imports and delegation require reading the canonical procedure; both skill validators passed; independent testing passed for links/imports, roles, recovery, and status consistency. Client runtime discovery was not observed. No app scope expansion or global configuration changes.

## Decisions outside this approved build

No product decision remains open for approved P0/P1. C1 (R18) was added by the user's scope change on 2026-10-17. P2, a gesture spelling keyboard, predictive or multilingual writing, fully independent first-run setup, additional browser/device guarantees, remote speech, external automation, backend/paid services, and publishing require a separate scope change. Do not ask about these excluded features during this build or implement them opportunistically.

## Approved unattended build contract

The user explicitly approved UA1, UA2, and UA3 in response to the final decision bundle. This contract supersedes the earlier first-slice-only authorization and deferred P0/P1 product questions. Independent review/testing of the reconciled files passed, completing WF2/W1; the user's later single `build` instruction requests sustained implementation as a persistent Goal. No application code starts during this readiness discussion.

### UA1 — Scope, autonomy, and stopping condition

Approved: the later `build` instruction explicitly requests Goal mode for the following bounded objective, using existing workspace/automatic approval controls:

1. Implement and independently review/test W2–W5, then complete all remaining P0 through W6. W5 becomes a first-slice integration checkpoint, not the end of authorized work.
2. Once P0 automated acceptance is stable, implement all P1 in this order: minimal local profiles and recalibration; observed reliability scoring and mapping recommendations; free movement discovery with deliberate verification. Review/test each feature separately. Do not skip approved free discovery merely because guided calibration already works.
3. Finish W8 software/demo/accessibility hardening, automated browser checks, run instructions, and a precise manual acceptance checklist. P2, external browser/OS automation, backend services, paid APIs, publishing, and pushing remain excluded.
4. Continue through the approved scope without asking again at every checkpoint. Routine implementation choices and reversible content details belong to the engineering agents; document them and obtain the required independent reviews. Product approval does not replace technical review.
5. Stop when the selected scope is implemented and all applicable automated checks and independent reviews pass, leaving manual checks explicitly pending; or when an actual external blocker/usage limit prevents further useful authorized work. Do not promise a fixed completion time or unlimited execution. Preserve a runnable baseline and exact handoff if interrupted.

Approved gate distinction: record software status and human/hardware acceptance separately. If required manual evidence is unavailable, leave that criterion and overall waypoint unchecked, but permit later independent authorized software tasks after their software dependencies pass. An observed hardware failure blocks affected dependencies; missing evidence does not justify pretending success or abandoning unrelated work. Use statuses such as `software verified; human acceptance pending`. Never mark all of W2/W5/W8 reached solely on synthetic tests.

Local execution requires this computer to stay awake, powered, online, and connected to the running client. Goal mode supports continuation across turns but does not bypass permissions, outages, or usage limits. Do not silently change OS power settings or global client/security settings. Current native network approval checks succeeded for npm metadata and the official model URL; that does not pre-approve every future external action.

Read-only Windows power-plan preflight found idle sleep configured at 45 minutes on AC and 15 minutes on battery. Before an overnight local run, the user must keep the computer awake for the run (for example, temporarily set plugged-in Sleep to Never), powered, and connected. Display sleep is separate from system sleep. No power setting was changed during readiness work.

UA1 answer: **APPROVED — Full P0 + all P1 in that order**, autonomously as a persistent Goal on the later `build` instruction. No time/token budget was specified; existing runtime limits apply.

### UA2 — Approved product defaults

- Target English on desktop Chrome/Edge using a webcam, one calibrated person in view. No mobile/Safari guarantee in this hackathon scope.
- Initial browser camera permission and first calibration may use optional caregiver/mouse/keyboard assistance. Use timed visual/optional spoken prompts and optional movement choices. Do not require any specific expression. Once a gesture works, communication, practice, Pause/Resume, scan speed, mappings, and interactive recalibration decisions are gesture-operable.
- Keep the approved calibration protocol: approximately 10 valid seconds of rest, three training repetitions, two held-out attempts, a neutral-armed 10-second negative activity check, and explicit comfort confirmation. Numerical parameters, robustness changes, optional timing adjustments, and exact prompt wording are reviewed engineering choices; show actual evaluated counts/durations.
- Provide six starter phrase tiles: `Yes`, `No`, `I need water`, `Please help me`, `I am uncomfortable`, and `Thank you`. Allow assisted/conventional editing during setup. Gesture selection appends phrases to composition; separate Speak/Clear controls act on it. This scope does not include a gesture spelling keyboard, arbitrary typed writing, predictive text, or multilingual content. Start scanning at two seconds with gesture-accessible speed controls.
- Keep webcam inference and all runtime model assets local. Use only browser speech voices marked local; if unavailable, retain visible communication text and explain the local-speech limitation. No remote voice fallback without a separate explicit change to this rule.
- When profile storage is implemented, require explicit opt-in Save; store only versioned minimal calibration/mapping/settings data locally, including deliberately customized phrase vocabulary, with named profiles and Delete. Never save video, raw frames, biometric identity, message history, or composer text. Rest/revalidation and mapping confirmation precede arming a restored profile. User decision 2026-10-17 (R15, merged as R17): Continue with the automatic Last setup does not repeat a rest check or movement check that really passed less than an hour ago; older checks run again, and Re-check always repeats everything. The times those checks passed are stored with the profile (times only; never frames or evidence), and any failed or cancelled restore forgets them. Mapping confirmation always remains.
- Ask whether each verified movement is comfortable enough to repeat; let a user reject/retrain it and report fatigue. If no gesture is usable, provide clearly labeled assisted/manual or external-switch/Space input. Do not claim gesture-only recovery when no usable signal exists.

UA2 answer: **APPROVED — All proposed product defaults accepted.** These answers close the previously deferred browser/language, setup, composition, calibration, speech, storage, fallback, and P1 product decisions. Reversible wording and routine engineering details are delegated.

### UA3 — Local checkpoints in Git

Approved: during the later build, create local commits after meaningful chunks pass their required automated checks and independent review. Keep required manual evidence pending in the handoff. Use the existing Git author identity; if absent, leave changes uncommitted and record the reason rather than inventing an identity. Commit messages remain one short descriptive subject, no body/trailers/coauthor attribution. Never push, publish, deploy, or rewrite history.

UA3 answer: **APPROVED — Commit locally at verified checkpoints during the build.** The user will push.

### Engineering defaults — no further product decision required

- Use compatible pinned dependencies, a lockfile, strict typed module boundaries, pure testable signal/control logic, and appropriate browser-test tooling. Dependency/model downloads and narrowly scoped native approval requests are ordinary setup; no global npm/client/security changes or paid services are implied.
- Detect at least two faces in the tracker configuration so multiple-face rejection is real; use custom time-based smoothing. Add a stale-frame watchdog and reject stale/out-of-order results even when no new valid frame arrives. Do not overlap inference or build a backlog.
- Every model/mapping/profile change invalidates affected approval and requires fresh neutral. During recalibration keep the last model only for restricted setup decisions; timed capture disables communication commands. Scanned Start/Retry/Cancel/Keep old profile/Approve decisions remain reachable; failed old recognition offers the explicit assisted fallback.
- W6 automated acceptance covers two distinct independently verified simulated movements, ambiguous/simultaneous activation rejection, reapproval on mapping edits, one-gesture fallback, and operational-control reachability for supported gesture counts.
- P1 tests cover malformed/version-incompatible/nonfinite profile rejection, opt-in save/delete, disarmed restore, recalibration cancellation and phase isolation, observed scoring denominators, comfort-aware editable mapping recommendations, correlated discovery grouping/noise rejection, and inability of unverified candidates to control communication.
- Integration checks cover calibration → restricted approval → practice → compose → Speak; tracking loss/staleness/hidden tabs/phase changes cannot emit delayed actions. Test camera denial, model-load errors, missing local speech, layout/focus, and browser operability. Synthetic fixtures are for tests only; the application demo source remains real camera inference.

Readiness checkpoint:

- [x] **WF2 — Close build decisions.** Reached: audits and UA1–UA3 answers complete; all affected documents and the canonical skill reconciled; independent final consistency review and skill/link/import/whitespace/workflow validation passed. Scope approval alone does not start implementation; the user's later `build` instruction does.
