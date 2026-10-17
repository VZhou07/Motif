# Motif reasoning and independent review

## R1 — First vertical slice design (revision 2)

Status: design APPROVED by `architecture_review` for R1 revision 2. The user subsequently approved product defaults and the expanded build scope in R3/UA1–UA3; current authorization is defined there. No application implementation has started. Earlier review rows preserve their historical pending states, not current user decisions.

User workflow addition: work must survive an individual agent failing. `progress.md` records active ownership, owned files, reviewed revision, partial changes, last passing checks, and exact resume steps. A replacement reconciles documents with Git before writing; an independent reasoning reviewer approves changed designs and an independent testing reviewer runs relevant checks before completion. These gates make failures visible and recoverable; they cannot prove software is bug-free.

### Problem and chosen approach

The first technical question is whether a user's own repeated movement, calibrated relative to their own resting variation, can reliably select a real interface action. Pretrained MediaPipe features plus simple personalized thresholds keep the problem inspectable and achievable in 36 hours. A large learned model, free-discovery clustering, DTW, and background adaptation would add uncertainty before this chain works.

React renders UI; pure numeric/control modules receive monotonic millisecond timestamps and typed feature records. Face Tracker runs actual MediaPipe locally with a bounded inference rate, rejects absent/multiple faces, and closes all camera/model resources on stop/unmount. Self-host version-matched model/WASM assets. Numerical state resets after missing data or excessive gaps. Preview mirroring does not mirror inference.

Run at most one inference at a time, skip repeated video frames, reject out-of-order results, and never accumulate an inference backlog. First-run camera permission and setup can require a trusted conventional interaction or optional caregiver; the app must explain that. The single-user prototype does not establish facial identity, so ask that only the calibrated person occupy the camera view. Refit after failed verification invalidates all previous verification results. Future stored profiles need a version and feature schema ID before restore.

R1 design contract: `FeatureFrame { timestampMs, tracking, values }` where values are finite numeric signals, `Baseline { durationMs, samples, perFeatureCenter, perFeatureNoise }`, `GestureModel { feature, direction, activationThreshold, releaseThreshold, activationMs, releaseMs }`, `Observation = neutral | active | uncertain`, and `ControlEvent` emitted solely by the safety state machine. UI and calibration phase changes explicitly reset recognition safety state. No synthetic source is wired into the application.

### Calibration and evidence

Record 10 seconds of valid, fresh resting frames. Use robust median and noise estimates with a numerical floor appropriate to coefficient versus angle units; floors protect arithmetic and do not define a universal gesture. Time-based EMA avoids frame-count-dependent smoothing. Reject nonfinite inputs, insufficient sample density, and interrupted trials rather than interpolating intent.

User/caregiver chooses a feature and movement direction that the person can comfortably vary. Timed trials prompt rest, movement, and return to rest. Three training trials must each begin/end at neutral. Fit thresholds between the high end of rest/noise and the low end of repeated sustained movement. Separate activation and release thresholds provide hysteresis. Insufficient margin or inconsistent trials means retry/choose another movement, not default success.

Freeze the fitted model, then observe two new attempts and a ten-second negative ordinary-activity interval using the same runtime state machine. Require exactly one activation per positive attempt, fresh neutral on both sides, and zero activations in the negative interval. Start the negative interval only after fresh neutral arms recognition; interrupting/invalid input restarts or fails the window. Show evaluated duration and event count. Require explicit comfort confirmation. Report counts as observations, not a general accuracy claim. Neither held-out samples nor negative samples tune the model; retrying calibration starts a new training cycle.

After verification, a restricted setup scanner can use the learned gesture to confirm comfort, retry/reject, and approve the mapping. Communication actions stay disarmed until these explicit confirmations. This avoids requiring a mouse/keyboard for approval while preventing an unapproved mapping from speaking a message. Every setup phase transition resets the state machine and requires fresh neutral. Six phrases may be edited conventionally during setup; gesture-only operation appends phrases and separately invokes Speak/Clear, not a text-editing keyboard.

### Input and scanner timing

Start unarmed; a continuous fresh neutral dwell arms the recognizer. A continuous above-activation dwell emits one event and locks until a fresh below-release dwell. Hysteresis-band samples neither activate nor rearm. Invalid tracking, missing/nonfinite selected feature, ambiguous observations, timestamp reversal, long frame gaps, hidden tab, stop, or phase transition cancels pending state and returns to unarmed.

The first model has one gesture, so multi-gesture conflicts arrive at W6; the observation/state contracts already admit uncertainty without fake conflict detection. No model confidence can bypass the neutral/dwell gates.

UI selection and scanner advance use a deterministic reducer. At activation-dwell onset, latch the currently displayed target and freeze scan advancement; a successful dwell selects the latch, while cancellation/uncertainty discards it. Reset the deadline after resolution. A late tick never catches up through multiple items. Test onset before a scan boundary and activation after it. Tracking loss and hidden tabs suspend scanning and clear any latch. On recovery reset the deadline and wait for fresh neutral before enabling selections. Scanned controls include scan-speed adjustment.

Pause is a scanned target. In paused mode the same calibrated gesture resumes, after neutral rearming, without selecting a phrase. Recalibrate and practice remain reachable in scanning. Reset recognition on every mode/approval change so a calibration hold cannot spill into a command.

### Accessibility and privacy

Use large controls, visible scanning state, semantic live feedback, adjustable speed, high contrast, and optional local spoken prompts. Setup may use optional assistance in this slice; do not imply fully independent first-run setup is complete. In operation, gesture-only controls include Pause/Resume and recalibration entry. Failed calibration offers retry, alternate movement, or assisted/manual input.

No backend, analytics, frame uploads, raw recordings, biometric identity recognition, or automatic medical/emergency detection. First-slice profile data stays in memory. Prefer local speech voices; if none exists, communicate in text and disclose unavailable local speech rather than silently claiming offline voice output.

### Risks and tests before marking complete

- Model bias, atypical movement ranges, lighting/camera variation: baseline and observed verification are required; no universal success guarantee.
- Synchronous MediaPipe inference can block rendering: cap inference frequency, avoid frame backlog, measure manually, move inference to worker if necessary after evidence. A frame gap cancels actions even if inferred scores look strong.
- Browser voice availability and autoplay differ: initialize from user interaction; show speech availability and cancellation; validate manually.
- False activations from talking/ordinary motion: include a held-out negative interval; reject noisy candidates and never auto-adjust thresholds using unconfirmed events.
- Test pure logic with timestamped simulated rest/noise/activation/dropout streams. Cover every safety invariant and a calibration-to-scanning action integration test. Unit passing does not establish hardware/accessibility success.

### Independent review record

| Revision | Reviewer | Findings / resolution | Verdict |
| --- | --- | --- | --- |
| Pre-draft | requirements_review | Recommended held-out verification, fail-closed tracking/gaps, reachable Pause/Resume, honest hardware limits, and later P0/P1 scope distinction; incorporated above. | Preliminary advice only. |
| Pre-draft | architecture_review | Recommended fresh neutral after recovery, anatomical sides, independent negative window, local speech handling, deterministic scanning, and explicit scope confirmation; incorporated above. | Preliminary advice only. |
| R1 | Review gate | Independent reviewers inspect the current documents before implementation; user approval remains a separate gate. | See revision-specific verdicts below. |
| R1 revision 1 | requirements_review | Planning package approved for presentation to user; requested explicit setup-only phrase editing, append-versus-speak behavior, and gesture-accessible scan speed. Resolved in revision 2. | Planning review passed; product confirmation pending. |
| R1 revision 1 | architecture_review | Found approval deadlock, potentially unarmed negative interval, and dwell crossing scan boundary. Revision 2 adds restricted approval scanner, neutral-armed negative window, and target latch. | Changes required; revision 2 re-review pending. |
| R1 revision 2 | architecture_review | Re-read all five documents; verified restricted approval flow, neutral-armed negative evaluation, onset target latch, phrase/editing scope, scanned speed controls, independent testing, and failover handoff. No unresolved architecture/safety blockers. | APPROVED as a design; user scope confirmation and implementation tests still pending. |
| R1 revision 2 | requirements_review | Independently re-read five files; checked seven local links, exact Claude import, checkpoint/status consistency, Git/whitespace, and eight official reference URLs. No blocking findings; no local Claude execution or app test claimed. | PASS for planning/documentation; user scope confirmation pending. |

Append review results; do not overwrite earlier findings. Add a new reasoning revision before any substantial design change and have it independently reviewed before implementing it.

### Primary references consulted

- [MediaPipe Face Landmarker web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js): real blendshapes, facial matrices, video mode, side conventions, and synchronous inference limitations.
- [Vite guide](https://vite.dev/guide/) and [Vitest guide](https://vitest.dev/guide/): project runtime and testing setup. Pin actual selected versions in the lockfile after checking compatibility.

## R2 — Discoverable checkpoint skill (revision 1)

Status: COMPLETE for WF1. `checkpoint_skill_review` approved the design before implementation and `checkpoint_skill_test` independently validated the written result. That task authorized workflow setup only. The later R3/UA1–UA3 answers now approve the expanded product scope; they do not retroactively change R2 review history.

### Design and acceptance criteria

Keep one canonical procedure in `.agents/skills/motif-checkpoint/SKILL.md`, with required `name` and `description` frontmatter. A thin `.claude/skills/motif-checkpoint/SKILL.md` adapter reads the canonical file via `../../../.agents/skills/motif-checkpoint/SKILL.md`. Both clients get discoverable skill entries without maintaining two versions of the procedure.

Skill discovery normally exposes metadata, not a guarantee that every agent read the full procedure. Therefore `AGENTS.md` explicitly requires coordinators and delegated agents to read the canonical file, and every delegation names that file alongside the project documents and bounded assignment. `CLAUDE.md` retains `@AGENTS.md` and adds a real import of the canonical skill. Follow the user's current task and role; a reasoning reviewer or tester returns its findings to the coordinator instead of recursively starting the entire workflow. Ordinary questions do not start implementation.

The procedure covers reconciliation with Git/partial work, authorization, file ownership, reasoning review, implementation, independent testing, and recorded checkpoint/handoff evidence. Root documents remain authoritative for product decisions, rules, and status. Do not copy those documents into the skill. A documentation-only task uses relevant document/skill validation; Vitest, production build, camera, and speech tests are not applicable until application code exists.

Acceptance: both skill entries pass the bundled skill validator; canonical/adapter links and Claude imports resolve; shared rules explicitly require reading/delegation; no circular imports, placeholder scaffolds, or product-gate bypass; independent testing subagent inspects and runs the checks. Claude is unavailable locally, so static import validation does not establish runtime loading. No user/global client settings, commits, or pushes are part of this task.

### Review record

| Revision | Reviewer | Evidence | Verdict |
| --- | --- | --- | --- |
| R2 revision 1 | checkpoint_skill_review | Read all five current documents and Git state; checked canonical/adapter path resolution, role boundaries, product-approval separation, and proposed validation. | APPROVED before skill writes; independent post-write validation pending. |
| R2 revision 1 | checkpoint_skill_test | Independently ran both skill validators (exit 0); checked 13 local links, two resolving Claude imports with no cycles, naming/frontmatter, all seven untracked documents for whitespace, delegation roles, handoff, and product-gate consistency. | PASS; no implementation blockers. Static/document validation only; client runtime loading and app behavior not tested. |

## R3 — Readiness for a sustained unattended build (revision 1)

Status: COMPLETE for WF2/W1. UA1–UA3 approved by the user; all affected plan/rule/skill/gate wording reconciled and final independent review/testing PASSED. No application code or active build goal has started; the user's later `build` instruction will start the approved Goal.

### Findings and resolution

Three independent read-only reviewers (`readiness_scope`, `readiness_architecture`, `readiness_environment`) inspected the current documents. All found that the first-slice stop at W5, separately approved W6/P1 scope, proposed product defaults, and human-only acceptance gates would obstruct the desired unattended full-MVP run. These were real gaps; prior approval of the first-slice architecture did not settle them.

The contract consolidated three user decisions: build endpoint/continuation as a Goal, a concrete product-default bundle, and local commits. The user approved all three recommended options: full P0 plus all ordered P1; all proposed product defaults; local verified checkpoint commits. Reversible implementation choices remain delegated, independent reasoning/testing remain required, and P2/external publishing remain excluded. No open product decision remains within this selected scope.

Automated software acceptance is distinct from human hardware acceptance: leave unseen webcam/comfort/speech/limited-input criteria pending, while independently testable authorized work may advance after software dependencies pass. An observed failure still blocks dependent work. This avoids both falsely declaring a demo verified and stopping all progress because the user is asleep. Root rules, canonical skill, Claude entry, plan, and progress express this same gate and continued scope; final independent validation confirmed consistency.

Recalibration/remapping now has an approved operational contract: existing gestures navigate restricted setup decisions, timed recording disables communication, cancel can keep the last approved model, changes invalidate approval, and no remaining usable gesture means assisted/external-switch recovery. Add a stale-frame watchdog and configure actual multi-face detection so safety promises are implementable. These are engineering specifications, not extra user choices.

### Preflight evidence and limits

- Verified Node 24.13.1, npm 11.8.0, Python 3.11.9, a Codex executable, and installed Chrome/Edge binaries. No application/package manifest, project dependencies, or Playwright installation exists yet. Claude is absent from this shell's PATH.
- Default npm has `offline=true`; a command-local online override still encountered sandbox connection refusal. Native sandbox escalation then successfully ran read-only `npm view vite version engines --json` with a temporary cache and command-local online flags. It returned Vite 8.3.4 with Node range `^20.19.0 || >=22.12.0`, compatible with the installed Node. This checks connectivity/compatibility, not a final dependency selection.
- A native-approved HEAD request to the official MediaPipe model URL returned HTTP 200. No model, package, or browser was installed, and no global npm/client/security setting was changed. Future commands remain subject to native approval policy.
- Real person calibration, comfort, physical gesture-only operation, and actual speech audibility remain unobserved. Automated tests cannot manufacture that evidence. No local camera access is required for the current audit.
- Read-only `powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE` returned AC `0x00000a8c` (2700 seconds / 45 minutes) and DC `0x00000384` (900 seconds / 15 minutes). The user must keep the local computer awake, powered, and connected for an overnight run. No power setting was changed. Both existing Git author-name/email presence checks passed without printing values; no commit was created. `get_goal` returned no active goal.
- Official [long-running work](https://learn.chatgpt.com/docs/long-running-work) and [Goal mode](https://learn.chatgpt.com/docs/use-cases/follow-goals) guidance supports a bounded multi-turn goal with explicit completion criteria; permissions and usage limits still apply. Local execution requires the computer to remain available. [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments) can run while a computer sleeps, but no cloud migration or push is authorized here.

### Independent audit record

| Revision | Reviewer | Evidence / recommendation | Verdict |
| --- | --- | --- | --- |
| R3 pre-draft | readiness_scope | Read all required files; found first-slice/full-MVP scope mismatch and unapproved defaults; proposed endpoint, phrase-only composition, assisted setup, local profiles/speech, and separate human acceptance. | Readiness gaps identified; proposed choices need user confirmation. |
| R3 pre-draft | readiness_architecture | Read required files/Git state; identified manual-gate stall, recalibration/remapping recovery gaps, multi-face/watchdog issues, and later automated acceptance criteria. | No app implementation yet; consolidate and review final contract after answers. |
| R3 pre-draft | readiness_environment | Verified tool versions, installed browsers, npm offline setting, absent app/dependencies/Claude, and handoff consistency. Did not install or access camera. | Environment basics available; root subsequently verified native-approved registry/model connectivity. |
| R3 revision 1 proposal | readiness_scope | Re-read the concrete UA1–UA3 contract; found no additional product question. Confirmed phrase customization can be profile settings without saving drafts/history. | PASS for the complete decision bundle; user subsequently approved it. |
| R3 revision 1 proposal | readiness_architecture | Re-read plan/reasoning/progress/rules/skill; confirmed endpoint, P1 order, manual/software split, recovery, privacy, commits, future Goal trigger, and excluded scope. | APPROVED before reconciling the rule/skill implementation; post-answer consistency review pending. |
| R3 revision 1 final | readiness_architecture | Re-read all seven documents and Git state after UA1–UA3 reconciliation; confirmed continued scope, role/recovery gates, commits/no push, and no remaining product decision. Two wording cleanups were applied. | PASS; ready for later build instruction. No application/hardware execution claimed. |
| R3 revision 1 final | readiness_environment | Independently executed both skill validators (exit 0), checked all seven documents, 13 local links, two imports/no cycles, names/frontmatter, whitespace/placeholders, Git/base/app absence, and scope/status consistency. | PASS; no blocking inconsistency or unanswered product decision. Network/power/identity observations are root preflight evidence, not independently repeated. |

## R4 — First implementation, tracker and personalized controls (revision 1)

Status: APPROVED by independent `build_review` before application writes, including the two clarifications below confirmed by the core implementer. The user explicitly started the persistent build Goal and added no-question/covered-camera/short-status instructions. `STATUS.md` is the bounded plain-language note; `progress.md` is the exact technical handoff. No live-person camera test will be attempted.

### Ownership and stack

Root owns package/configuration, asset setup, UI/orchestration, speech, and shared docs. `face_tracker` owns `src/tracker/**` and its tests. `core_engine` owns `src/domain/**`, `src/engine/**`, and their tests. `build_review` is an independent reviewer/tester with read-only ownership. Writers do not edit each other's files without explicit transfer.

Pin current compatible React 19.3.1, Vite 8.3.4, plugin-react 6.1.2, TypeScript 7.0.2, Vitest 5.0.5, Tailwind 4.3.3, and MediaPipe tasks-vision 1.1.1 (official npm metadata checked). Installed Node24.13.1 meets Vite/Vitest engines. Current jsdom30 needs newer Node, so select compatible jsdom26.1.0 rather than changing the system Node. Use Playwright with already installed Chrome for headless browser checks. Assets are self-hosted: copy matching package WASM loaders/binaries and download the official version1 face landmarker model at setup; serve only local asset URLs at runtime.

### Typed boundaries

`FeatureFrame = {timestampMs:number, tracking:'tracked'|'missing'|'multiple'|'invalid'|'stale', values:Partial<Record<FeatureId,number>>}`. Seventeen feature IDs: browOuterUpLeft/Right, browInnerUp, eyeBlinkLeft/Right, eyeWideLeft/Right, jawOpen, mouthSmileLeft/Right, mouthPucker, mouthFrownLeft/Right, cheekPuff, headYaw/Pitch/Roll. Coefficients are unitless; head angles are signed DEGREES. Anatomical sides are never swapped by preview mirroring.

`Baseline` stores valid duration/sample count and per-feature `{center,noise,low,high}`. `GestureModel` stores id/label/feature/direction (+1/-1), personal baseline center, projected activation/release thresholds, and dwell durations. `fitBaseline(frames,minimumMs)` and `fitGesture({baseline,trials,feature,direction,id,label})` return explicit success/rejection results. A training trial contains restBefore/movement/restAfter frames. Three distinct repetitions fit the model; held-out samples never enter fitting.

`FeatureProcessor.process(frame)` uses time-based EMA and resets after invalid input, nonmonotonic time, or >250ms gap. Baseline accepts sufficient dense contiguous valid input for ten seconds; invalid data restarts the active collection window. Fits use robust baseline/absolute-rest spread and the weakest repeated sustained movement, with feature-unit noise floors only for numeric stability. Reject insufficient separation or inconsistent/invalid/restless trials instead of manufacturing thresholds.

`GestureRuntime.step(frame,nowMs)` rejects nonfinite/missing/stale/future/out-of-order data; `invalidate()` clears pending/armed/held state on phase changes, hidden tab, watchdog timeout, or tracking loss. True global neutral requires absolute deviation below every model's release threshold. A gesture is active only when exactly one signed projection crosses activation and no other model has a positive-direction projection above release. Opposing models on the same feature remain distinguishable: the opposite model's negative projection cannot block a valid activation, but opposite motion alone cannot count as neutral. Any unresolved band/conflict is uncertain and fail-closed. Neutral350ms arms; activation250ms emits once; neutral350ms rearms. Runtime exposes pending start/cancel/event so scanning can latch the visible target at dwell onset.

`evaluatePositiveAttempt(models,frames,expectedId)` requires exactly one expected event and neutral boundaries; `evaluateNegativeWindow(models,frames,minimumMs=10000)` starts its duration only after fresh neutral arms the same runtime and fails on interruption/any activation. Return observed event counts/durations/reasons, not an accuracy claim. Frozen models are never tuned by verification.

Reviewed clarifications: `FeatureProcessor` is the sole preprocessor. Training, verification, and runtime all consume that same processed representation/configuration without internal re-smoothing; reset processor/runtime at phase boundaries and begin capture with fresh rest. Positive attempts reject any invalid/missing/nonmonotonic/>250ms-gap frame anywhere, even if later tracking recovers; require sufficient sample density and fresh neutral on both sides.

`ScanController` owns targets/index/interval/deadline/latch/suspend/pause. `tick(now)` advances at most one item; `beginSelection(now)` latches the displayed target without first advancing, and freezes scanning. `commitSelection` returns only that latch; cancellation/dropout discards it and resets timing. `move`, `setTargets`, `setInterval`, `setSuspended`, and `setPaused` reset deadlines to prevent catch-up. A paused gesture event resumes the interface after fresh neutral and never selects a phrase.

`FaceTracker.start(video,onFrame,onError)` loads the local detector then requests video-only camera; `stop()` closes tracks/model/callbacks and resets generation. Configure numFaces2, blendshapes/matrices on; malformed/missing/multiple tracking yields empty invalid frames, never zero signals. Extract head angles from normalized column-major rotation. Infer at most15Hz on new video frames, one inference at a time, rejecting >250ms result age. Generation guards close late async resources on stop/retry. Root watchdog also invalidates stalled input even if inference never emits another frame.

### UI flow and verification

Build the responsive high-contrast communication screen and collapsible numerical signal dashboard. First show a runnable camera adapter/dashboard; then connect guided baseline → user-chosen signed feature → three timed rest/movement/rest training attempts → two held-out attempts → ten-second negative activity → restricted comfort/mapping scanner → practice → approved communication. Recording phases run on valid frame time and dispatch no communication. Existing verified gestures may operate restricted setup decisions; no previous hold can cross a phase transition. Optional assisted Space/manual mode is clearly labeled and uses real interface actions, not fake gesture recognition; it never produces calibration/verification evidence.

Single gesture selects from scanning; multiple approved gestures navigate/select with ambiguity safety. Root maps runtime pending start/cancel/event into the pure scanner. Phrase selection appends; Speak uses only an available localService voice; missing speech retains text. Space ignores key repeats, editable form targets, and modifier combinations. All operating controls, including speed, practice, pause/resume, mappings/recalibration, remain scanned/reachable. Browser tests may exercise assisted mode; numeric integration tests independently exercise the genuine recognition chain. Do not expose a synthetic/demo source in the application.

Tests before advancing: pure extraction sides/angles/invalidity; tracker start/stop/denial/cancellation/stale frame cleanup; baseline/gap/noise/weak model rejection; isolated/opposing/ambiguous gestures, brief spikes, sustained holds, rearm, phase reset, stale watchdog; held-out frozen data and armed negative window; scanner dwell crossing boundary and no catch-up; actual UI controls, camera/model failure, local speech absence, and assisted interaction. Run unit tests, strict typecheck, production build and independent executed review; leave covered-camera human criteria pending and continue approved software work.

Review verdict: `build_review` explicitly APPROVED R4 revision1 with the recorded same-representation and strict positive-trial interruption clarifications; implementers confirmed them. Later profiles/scoring/discovery features receive their own reasoning revision/review before implementation.

### R4 revision 2 — smooth movement transition correction

The implementer's realistic EMA→runtime integration test found that disarming on every transition-band sample prevents a smooth movement from ever reaching activation while armed. Before changing code, independent `build_review` explicitly approved this narrow correction: an already-armed machine may stay armed through exactly one nonconflicting positive-direction transition band, with no start/event and no rearming. A pending activation that falls below activation cancels and requires fresh neutral; invalidity, conflicts, multiple bands, and opposite-only excursions still disarm. Add slow-ramp, band-oscillation/no-event, pending-cancellation, conflicting-band, and opposite-motion tests. This preserves R1's rule that band samples neither activate nor rearm. Verdict: APPROVED before runtime correction.


## R5 — Session orchestration, guided calibration UI, communication (revision 2)

Status: APPROVED (revision 2) by independent `r5_rereview` before implementation; revision 1 had 4 blockers, all resolved. Owner: Kiro coordinator (session 2). Builds on approved R4; only the items below are new decisions.

### Session controller contract

`src/app/session.ts` exports a browser-independent `MotifSession` (pure TS, injected clock and speech port). React only renders `session.snapshot` via `useSyncExternalStore` and forwards inputs. Inputs: `ingest(rawFrame, nowMs)` (tracker frames, passed through the session's single `FeatureProcessor`), `tick(nowMs)` (scan timing and watchdog), `setHidden(hidden, nowMs)`, `setCamera(status, message)`, `switchPress(nowMs)` (assisted Space), and named conventional commands for assisted setup. Output: immutable snapshot (stage, live processed frame, recording prompt/progress, verification evidence, scanner state, message, notices) plus `SpeechPort.speak` calls. No synthetic source exists in the app; tests drive the same class with synthetic frames.

Stages: `welcome → baseline → choose → training → verify → negative → comfort → mapping → practice → communication`, plus `setup-failed` and `recalibrate-confirm`. Every stage change resets the processor, invalidates the runtime, cancels scanner latches and requires fresh neutral.

### Timed capture (valid-frame time only)

- Baseline: 10 s contiguous valid processed frames; any invalid/gap frame restarts the window; 60 s valid-time cap then fail with reasons.
- Training trial: rest 2 s → move 3 s → return to rest 2.5 s, three trials. Verification attempt uses the same timing, two attempts, each evaluated by `evaluatePositiveAttempt` with a fresh runtime on the frozen model.
- Tracking interruption (invalid/missing/multiple/stale/gap/hidden) during a trial or attempt discards that recording and redoes it from rest; it never counts as success or as a failed attempt. Five interruptions in one stage fail the stage with an honest reason. A completed, uninterrupted attempt that fails evaluation fails verification (no retry-until-pass); retraining starts a new cycle.
- Negative window: a live `GestureRuntime` on the frozen model watches a frame segment. An event fails immediately (counted). Any frame the live runtime rejects or that disarms it after arming (opposite motion, conflict, invalid/stale/gap/hidden) restarts the segment: the rejected frame is dropped, the new segment begins at the next VALID frame with a fresh runtime, and a visible notice/restart count is shown. The armed span is measured only from frame timestamps (last frame − first armed frame). When it reaches 10 000 ms, `evaluateNegativeWindow(segment)` (fresh runtime replay, same frames) is called and is authoritative; if it disagrees with the live view, keep collecting and never pass on the live runtime alone. 60 s valid-time cap fails honestly. Show evaluated seconds, restart count and event count.

### Calibration engine change (core)

Prompted movement includes reaction/onset time. `fitGesture` currently takes the 25th percentile of the whole movement phase, so a normal ~0.7 s reaction inside a 3 s prompt can fake "overlap". Change: like settled rest halves, measure each trial's movement on its settled portion, split by timestamp: frames with `timestampMs >= start + (end − start)/3` of the movement phase, 25th percentile. Reject the trial unless the settled portion spans ≥600 ms (the existing per-phase minimum) with ≥5 samples; the UI's 3 s prompt gives ~2 s/~30 samples. Whole-trial continuity/density validation, rest checks and the consistency ratio stay unchanged. Tests: delayed onset inside the first third passes; movement only in the first third then rest fails; too-short settled span fails; existing calibration/pipeline tests rerun.

### Restricted setup scanners and models

`comfort` (Comfortable / Record again / Choose another movement) and `mapping` (Approve / Reject) scan with the just-verified candidate; `recalibrate-confirm` (Start recalibration / Keep current setup) scans with the approved model. These scanners only produce setup decisions; they cannot append, speak, or clear. Approval sets `approved`; any later model/mapping change clears it. Every decision also has a conventional button (assisted). If no model exists, failures offer Retry / Another movement / Assisted input via buttons.

Recalibration (when an approved model exists): timed capture ignores the old model and has a conventional Cancel button. At decision points (`choose`: Same movement / Keep current setup; `setup-failed`: Record again / Keep current setup; rejected mapping → `setup-failed`) the restricted scanner uses the OLD approved model. Any exit back to the old setup (cancel, failure, interruption cap) goes through an explicit scanned-or-assisted "Keep current setup" decision; it discards all new capture buffers and candidate, keeps the old approved model, and enters communication with a fresh runtime and reset scanner, so selections need fresh global neutral first. Only a newly verified candidate approved in `mapping` replaces the old model.

Evidence history: the snapshot keeps a setup-cycle counter and, per cycle, the training outcome, each held-out attempt's pass/event count/reasons, and the negative window's evaluated seconds/restarts/events. All are displayed in the evidence panel. A new cycle always requires three new training trials and a refit; the session never records extra held-out attempts against an unchanged frozen model.

### Communication and safety wiring

Targets: six phrases, Speak, Clear, Pause, Slower, Faster, Practice, Recalibrate (scan 2 s, clamp 1–6 s, ±0.5 s). Wiring per processed frame: `started → beginSelection`, `cancelled → cancelSelection`, `event → commitSelection` (or Resume when paused; paused events never select). Watchdog: no valid frame for >250 ms, hidden tab, camera stop/error or invalid tracking suspends the scanner and invalidates the runtime; recovery resets the deadline and needs fresh neutral. Phrase selection appends; Speak uses only `localService` English voices; otherwise text stays visible with an explanation. Practice uses its own targets plus Finish practice, never speaks.

Assisted mode (clearly labeled, zero-gesture path): Space (no repeat/modifier/editable target) selects the highlighted target immediately; it never produces calibration or verification evidence and never arms gesture approval. Mouse/keyboard buttons remain available for caregivers.

### Labels

Blendshape sides follow MediaPipe's subject-side convention. Head directions derive from the column-major transform math in `extractHeadAngles` with an unmirrored camera image: +yaw = turn toward the person's left, +pitch = chin down, +roll = tilt toward the person's right shoulder. These are mathematical derivations, pending real-camera confirmation; the live dashboard shows signed values so a mislabel is visible, and calibration rejects a wrong-direction choice.

### Tests before advancing

Session-level Vitest with synthetic streams: full baseline → training → verify → negative → comfort/mapping by gesture → practice → compose → Speak; interruption redo; failed attempt; negative false activation and restart; watchdog/hidden suspension with no delayed selection; dwell across scan boundary; pause/resume; recalibrate cancel keeps model; assisted Space mode. RTL tests for rendered controls, speech-unavailable text and camera-error messages. Playwright smoke test with Chrome's fake camera flags (synthetic test pattern, real camera never opened) verifying model load, camera start and 'face not found' fail-closed state. Then typecheck, build, independent test review.

### Revision 2 adoptions of non-blocking advice

Reset `FeatureProcessor` at every trial/attempt/segment start, not only per stage. The watchdog suspension and fresh-neutral rule apply to restricted setup scanners too. The detector always receives unmirrored video pixels; only the preview uses CSS mirroring, so anatomical labels cannot invert. Show observed frame interval and restart counts during capture. Add a labeled, default-off toggle for optional local spoken prompts (UA2). Use `aria-live` only for prompts/notices/selections, `aria-current` for the scan highlight, and honor reduced motion. R4 revision 2's "exactly one transition band" means one model's band at a time (no simultaneous bands), of any duration while armed; it never starts a dwell or rearms (existing tests cover slow ramp and oscillation).

### R5 review record

| Revision | Reviewer | Findings / resolution | Verdict |
| --- | --- | --- | --- |
| R5 revision 1 | r5_review | B1 negative segment/evaluator divergence; B2 recalibration exit could rearm without explicit keep/fresh neutral; B3 settled split underspecified; B4 cross-cycle failures could be hidden. Verified head-sign derivation, held-out separation, assisted boundaries, local speech, privacy. All four resolved in revision 2. | CHANGES REQUIRED |
| R5 revision 2 | r5_rereview | B1–B4 resolved; 600 ms settled minimum accepted (fail-closed). Non-blocking: live armed span uses the evaluator's `armed && neutral` condition; settled portion validated with `validateStream(settled, 600)` (density ≥6 samples); surface density reasons during the negative window; keep fixtures above the threshold; a gesture-driven "another movement" in recalibration can come later. Adopted. | APPROVED |
| R5 implementation | w2_w4_test_review | Ran vitest 96/96, tsc, build, browser-check 12/12 itself. Blocking test gaps: phrase editing untested; interruption cap 6 vs R5's 5 and caps untested; assisted-Space editable-target guard untested. No functional defect found. | BLOCKING ISSUES |
| R5 implementation (fixes) | w2_w4_recheck | Cap set to 5 (fails on 5th); new discriminating tests for setPhrase, interruption/negative caps, editable-target Space, focused-button Space, StrictMode single registration; duplicate live regions removed. Ran vitest 103/103, tsc, build. Note: the baseline 60 s valid-time cap is effectively unreachable because the 5-interruption cap fires first; kept as defensive fail-closed code. | PASS |

## R6 — Remaining P0: multiple verified gestures and mappings (revision 2)

Status: APPROVED (revision 2) by independent `r6_rereview`; revision 1 had 3 blockers (r6_review), all resolved. Adopted implementer notes: the step→automatic revert cancels any latch and resets the deadline; the idle timer resets on any `started`/event; the fallback cannot repair a degraded select gesture (assisted Space and helper buttons are the recovery); an added gesture still passes `comfort` before `mapping` (tested). Owner: Kiro coordinator. Builds on R4/R5; last passing commit `e2da549`.

### Adding a movement

Communication gains a scanned `Add a movement` control (gesture mode, fewer than 4 approved gestures). It enters `choose` with the approved baseline; the conventional chooser picks the new movement (assisted setup is allowed), and a restricted scanner offers `Keep current setup`. A movement identical to an approved one (same feature and direction) is refused; the opposite direction of the same feature is allowed (the runtime already separates opposing models). Training fits the new candidate exactly as in R5 (three trials, frozen model).

Verification uses the whole set `S = approved ∪ {candidate}` through the existing evaluators: two held-out attempts of the candidate (`evaluatePositiveAttempt(S, frames, candidate.id)`), then one cross-check attempt per already-approved gesture (`expectedId` = that gesture) so a new model cannot silently block or steal an old one, then the 10 s negative window on `S`. The capture view names the movement to perform. Failures follow R5 (no retry-until-pass; a new cycle refits). Evidence records each attempt with its expected movement.

### Setup scanners with several gestures

Restricted setup scanners keep automatic scanning; the runtime contains every verified model in play (approved plus a verified candidate), and an event from any of them selects the latched setup choice. Simultaneous or conflicting movements are uncertain and select nothing (existing runtime rule). Setup scanners never append, speak or clear. Hint text states "any of your verified movements selects".

### Mappings and approval

Actions: `select`, `next`, `previous`, `pause` (toggle). A valid mapping assigns distinct actions to distinct approved gestures, exactly one `select`, `previous` only with `next`. No `next` → automatic scanning (R5 behavior); with `next` → step scanning (no timed advance; `next`/`previous` move one item; speed controls hidden). Only mapped gestures act; the runtime still observes every approved gesture so ambiguity checks match the verified set (see Revision 2, B3).

`mapping` lists deterministic proposals as scanned targets: for each gesture as selector (creation order), the remaining gestures take `next`, `previous`, `pause` in order; then each single-gesture automatic fallback; plus `Keep current controls` when an approved mapping exists. Choosing a proposal opens `mapping-confirm` (Approve these controls / Choose different controls). Only Approve arms it; every mapping or gesture-set change clears approval and requires fresh neutral. Communication gains scanned `Change controls` → `mapping` (remapping without retraining). After approval, practice uses the new mapping and offers `Use previous controls` when an older approved mapping exists. Pause: `select` or `pause` gestures resume; `next`/`previous` do nothing while paused. Maximum four gestures.

Recalibrate (R5) still restarts with one new gesture and replaces the whole set only after approval; cancel/keep-current semantics are unchanged and now restore the approved set and mapping.

### Revision 2 changes (resolving r6_review)

- B1 per-action routing: in communication and practice, `started`/`cancelled` drive `beginSelection`/`cancelSelection` only when the gesture is mapped to `select`. Events dispatch by `mapping[gestureId]`: select → commit the latch; next/previous → `move(±1)`; pause → toggle. While paused only select or pause resume; every other event is discarded after its hold is consumed (fresh neutral still required). Unmapped gestures' events are discarded the same way. Setup scanners keep "any verified movement selects". Test: a next dwell across a scan boundary selects nothing.
- B2 step-scanning fail-safe: in step mode, 60 s of valid tracking with no gesture event reverts to automatic scanning with the select gesture (mapping and approval unchanged), with a visible notice; conventional buttons stay rendered in gesture mode for helpers. Tested.
- B3 armed set = verified set: the communication runtime uses all approved gestures (the set verified by held-out, cross-check and negative checks); unmapped gestures can still make input uncertain but never act. A failed cross-check or any rejected candidate leaves the previous approved set and mapping intact, re-armed only after fresh neutral. `Use previous controls` must pass the mapping validator for the current gesture set and still needs fresh approval in `mapping-confirm`.
- Non-blocking adopted: `Keep current controls` is first in `mapping`; in `mapping-confirm` `Choose different controls` comes before `Approve these controls`; cross-check attempts share the stage's 5-interruption cap and are reported separately from the two held-out attempts; worst case ~15 communication targets (~30 s cycle at 2 s) is documented.

### Tests

Pure: proposal generation for 1–4 gestures, mapping validation (duplicate actions, missing select, previous without next, unknown ids). Session: add a second gesture with held-out + cross-check + negative on the set; a candidate that steals the old gesture fails its cross-check; duplicate movement refused; simultaneous A+B selects nothing in setup and communication; Next/Select step scanning has no timed advance and selects the stepped item; previous; pause gesture toggles and next is ignored while paused; one-gesture fallback ignores the unmapped gesture; Change controls requires confirmation and fresh neutral, Keep current controls preserves the old mapping; 3- and 4-gesture mappings reach every operational control; assisted mode unaffected. RTL: mapping proposals render with scan highlight. Then full suite, typecheck, build, browser check, independent test review.

### R6 review record

| Revision | Reviewer | Findings / resolution | Verdict |
| --- | --- | --- | --- |
| R6 revision 1 | r6_review | 3 blockers (per-action routing, step-mode fail-safe, armed set = verified set); resolved in revision 2. | CHANGES REQUIRED |
| R6 revision 2 | r6_rereview | Blockers resolved. | APPROVED |
| R6 implementation (`c7e4e7f`) | w6_test_review | Ran tsc, vitest 129/129, build, browser-check 12/12 itself; 10 of 15 mutants killed. BLOCKING: a paused step scan un-paused itself through the 60 s fallback and could then select; negative window over the set and select-only latching were not pinned by tests (mutants survived). | BLOCKING ISSUES |
| R6 implementation (`e848456`) | w6_test_review (re-check) | Fixes `3e85aa3` (idle time not counted while paused), `2cefb57` (4 tests), `e848456` (visible fallback note). Ran tsc, vitest 134/134, build, browser-check 12/12; all previously surviving mutants and the paused probe killed. Non-blocking: helper Pause/Resume clicks should reset the idle timer (done in `6e017d0`); hint shows "Rest" before the fallback note while unarmed. | PASS — software verified; human acceptance pending |

## R7 — W7a: local profiles and restore (revision 2)

Status: APPROVED (revision 2) by independent `r7_review` re-review; revision 1 had 4 blockers, resolved in "Revision 2 changes" below (stale lines above were edited to match). Owner: Claude Code coordinator (session 3). Builds on approved R4–R6. W6 independent testing review runs separately.

### Scope

Opt-in, minimal, versioned local profiles (UA1/UA2): explicit Save with a name, a list of saved profiles, Delete (one or all), strict validation on load, and a disarmed restore that requires a fresh rest check, revalidation of every saved movement, the everyday-activity check and explicit mapping approval before anything can act. Recalibration/remapping/adding already exist (R5/R6) and keep their cancel/keep-current and assisted recovery; W7a only adds that a profile is never changed in storage except by an explicit Save.

### Stored data (and nothing else)

`StoredProfile = { version: 1, featureSchema: string, name: string, models: GestureModel[], mapping: { assignments: Assignments }, phrases: string[], scanIntervalMs: number }`, kept in `localStorage` under one key `motif.profiles` as `{ version: 1, profiles: StoredProfile[] }`.
- `featureSchema` is `FEATURE_IDS.join(',')`, so a model saved for a different feature set is rejected rather than reinterpreted.
- Models are the approved, frozen `GestureModel`s (feature, direction, baseline center, thresholds, dwell times, label, id). They are numbers relative to blendshape coefficients/angles, not images or identity data.
- Never stored: video, frames, baseline statistics, setup evidence, the message being composed, spoken history, camera status, or anything about the device. The rest check is always re-recorded.
- Limits: name 1–40 characters after trimming; at most 8 profiles; Save with an existing name needs explicit `replace`.

### Profile module (pure, `src/app/profiles.ts`)

- `parseProfile(unknown): Result<StoredProfile>` rejects, with readable reasons: a non-object; unknown or missing keys (exact key sets at every level, so nothing extra is ever kept); `version !== 1` ("made by a different version"); schema mismatch; a name outside the limits; 1–4 models; each model's feature not in `FEATURE_IDS`, direction not ±1, any nonfinite number (JSON turns NaN/Infinity into `null`, which also fails), `activationThreshold <= releaseThreshold`, `releaseThreshold <= 0`, dwell times outside the runtime's 100–5 000 ms (`isGestureModel`), empty/over-60-character label, duplicate ids or duplicate feature+direction; a mapping that fails `validateMapping` for those models; anything other than exactly 6 phrases of 1–60 characters; a scan interval outside `SESSION_LIMITS` bounds or not a multiple of the 500 ms step.
- `profileFromSession({name, models, mapping, phrases, scanIntervalMs})` builds a profile from explicit fields only and runs it through `parseProfile` before it can be written.
- `ProfileStore` port: `list(): { profiles: StoredProfile[]; rejected: number; available: boolean }`, `save(profile, replace): SaveResult`, `remove(name)`, `removeAll()`. `createLocalProfileStore(storage)` wraps a `Storage`-like object; every access is in try/catch so private mode, quota errors or blocked storage give `available: false` or an explicit failure, never a crash. Invalid stored entries are skipped and counted (the UI says "N saved profiles could not be read and were ignored"); corrupt JSON counts as one rejected entry. `createMemoryProfileStore()` serves tests and the default session (so a session without a store saves nothing persistently).

### Session wiring

- `MotifSession` takes an optional `profiles?: ProfileStore`; `useMotif` passes `createLocalProfileStore(window.localStorage)` (guarded). Nothing is written unless `saveProfile` is called.
- `saveProfile(name, replace=false)`: only in `communication` or `practice` with an approved set and mapping (gesture or assisted mode). It is a conventional, caregiver-assisted action (naming needs typing); it is not on the scanner, so a stray gesture can never save or delete. Announces the result (saved / name exists / storage unavailable / limit reached). The snapshot shows `profiles: { names, rejected, available, active, unsaved }`; `unsaved` becomes true when the approved set, mapping, phrases or interval differ from the active profile.
- `deleteProfile(name)` / `deleteAllProfiles()`: conventional with a confirm step in the UI; allowed in any stage; never changes the in-memory approved setup.
- `restoreProfile(name)`: allowed only from `welcome` or `setup-failed` when no setup is approved (a person switching profiles reloads or uses the welcome screen; demo Person A/B in W8 uses this). Needs the camera running. It re-reads and re-validates the profile from the store at that moment, then enters `baseline` with `restoring = profile`. Nothing is armed: `approvedModels`/`mapping` stay empty, so communication and Space-free gesture control are impossible until approval.
- After the fresh rest check, a rest-compatibility check: for every saved model, today's rest must sit inside that model's neutral zone, i.e. `|statistic − baselineCenter| < releaseThreshold` for today's rest `low`, `center` and `high` of that feature (the runtime's global-neutral rule, R4), so rest can arm and is not already counted as movement in either direction. If not, the restore fails honestly ("Your resting face reads differently from when this profile was saved…") and offers a new setup or assisted input. Thresholds are never re-centred or adapted silently.
- Revalidation (`verify` stage, frozen models, no fitting): two attempts for each mapped movement, one for each unmapped movement, each with `evaluatePositiveAttempt(set, frames, expectedId)` on the whole set; evidence kind `recheck`. Then the 10 s neutral-armed negative window over the set (existing `NegativeMonitor`). Interruption caps, no retry-until-pass and the 60 s caps are as in R5. A cycle records `source: 'restored'` and the profile name.
- `comfort` asks whether the movements are still comfortable (Comfortable / Choose another movement / Do not use this profile), scanned by any movement in the set. Comfortable opens `mapping-confirm` with the saved mapping as the pending proposal (label "Saved controls: …"); `Choose different controls` goes to `mapping` with proposals for the restored set. Only `Approve these controls` arms: then the set, mapping, phrases and scan interval are applied, `active` = the profile name, `previousMapping` is cleared, and practice starts with a fresh runtime (fresh neutral). Any failure, rejection or cancel clears `restoring`, applies nothing, and leaves storage untouched.
- `another-movement` after a failed or rejected restore starts a normal new setup from the fresh rest check; `record-again` is not offered for restores (there is nothing to re-record).

### Failure modes covered

Corrupt/foreign/newer/edited storage; blocked storage; restore of a deleted profile (re-read at restore time fails cleanly); rest that no longer matches; revalidation failure; a profile whose saved mapping is invalid for its models (rejected at parse); a gesture during restore before approval (no action: no approved set); stage changes (fresh neutral as everywhere); a save while capture runs (refused); message/composer text never reaching storage.

### Tests before advancing

Pure (`profiles.test.ts`): round trip; each rejection above (including `null` thresholds from NaN, extra keys, version 2, schema mismatch, 5 models, duplicate movement, invalid mapping, 5 phrases, bad interval/name); store list skips and counts bad entries and corrupt JSON; save/replace/exists/limit; remove/removeAll; storage that throws on get/set gives `available: false` or a failure result, never an exception. Session: save refused before approval and during capture; save stores only allowed keys and never the message; restore requires the camera; restore stays disarmed through every stage (no communication targets, `selectTarget` of a phrase does nothing); rest mismatch fails honestly; recheck plan and kinds; a failed recheck fails; negative window over the set; Approve applies set/mapping/phrases/interval and needs fresh neutral; Choose different controls; reject/cancel applies nothing; a two-movement step profile restores and steps; delete and delete-all; `unsaved` flag. RTL: Save form in communication, profile list with Restore/Delete-confirm on welcome, rejected-count notice. Browser check: still nothing persisted without an explicit Save. Then typecheck, build, independent testing review.

### Revision 2 changes (resolving r7_review)

- **B1 typed restore state and approval gate.** `restoring: { profile: StoredProfile; models: GestureModel[]; cycle: number } | null`. While restoring: `mappingSet()` returns `restoring.models`; `labelOf` resolves through it; `captureBaseline` completion branches to the rest-compatibility check and then `verify` (no `choose`, no training); `captureTrial`'s verify branch works from `mappingSet()` and `verifyPlan` instead of requiring `candidate`/`choice`, so `choice` stays `null` (no `record-again` anywhere). `approveMapping` for a restore refuses unless the current cycle has `source: 'restored'`, `outcome === 'verified'`, and its `verifiedIds` equal exactly the ids of the set being approved; on success it sets `approvedModels`, `mapping`, `phrases`, scan interval, `approvedBaseline = baseline` (today's rest, so later Keep current / Add a movement work), `active` = profile name, clears `previousMapping` and `restoring`, then practice with a fresh runtime. Every other exit clears `restoring` and applies nothing: `fail` (any kind, including camera loss/interruption caps), `cancel`, `useAssisted`, `startBaseline`, `another-movement`, `reject-profile`. Each exit is tested.
- **B2 exits at every restore stage.** New decision `reject-profile` ("Do not use this profile") offered in `comfort`, `mapping` and `mapping-confirm` while restoring, scanned by any verified movement in the set and rendered as a button; it fails with kind `rejected` ("Profile not used. Nothing was changed.") and applies nothing. `comfort` while restoring offers `comfortable`, `another-movement`, `reject-profile` (no `record-again`). Tests assert each restore stage has a gesture exit and a button exit.
- **B3 validation matches the runtime.** `parseProfile` first requires `isGestureModel` (recognition.ts: dwell 100–5 000 ms, non-empty id/label ≤ 100) for every model, then the stricter R7 rules (label 1–60, id 1–100, unique ids and feature+direction, thresholds as above). The 50 ms bound in revision 1 is replaced by the runtime's 100 ms.
- **B4 Save never destroys other entries.** The store keeps raw entries: `save`/`remove` re-read storage, replace or drop only the entry with that exact valid name, and write every unreadable entry back unchanged. If the container itself is corrupt JSON or has another `version`, Save and Delete of one profile refuse with "Saved profiles on this device could not be read; use Delete all to clear them", and only `removeAll` (which removes the key) clears it. The 8-profile limit counts all stored entries, readable or not, so it never silently drops one. Tests cover each case.
- **Adopted non-blocking.** Two recheck attempts for every saved movement that is mapped to an action and one for unmapped ones (4 mapped movements → 8 attempts, ~60 s, acceptable for a restore). A rest-compatibility failure names the movement(s) affected. The strict `<` in the rest rule is deliberately more conservative than the runtime's `≤`. The Save form states what is stored (movement thresholds, controls, phrases, scan speed) and what is never stored (video, images, messages). Deleting the active profile clears `active`, so `unsaved` becomes true. Saved phrases and interval replace the current ones only on Approve; phrases edited on the welcome screen before a restore are then replaced. Restore re-reads the store once at start and keeps that in-memory copy. Save/Restore/Delete are caregiver (conventional) actions by deliberate UA2 boundary: Save needs typing a name and Restore precedes any verified movement in this session; everything after the rest check is gesture-operable.

- **Adopted from the revision 2 re-review (non-blocking).** A rest-compatibility failure has its own kind `profile-mismatch` and title ("This saved profile does not fit today's rest"); today's rest stays usable, so `setup-failed` offers `another-movement` and assisted input, never `record-again`. Type changes: `AttemptEvidence.kind` gains `'recheck'`; `CycleEvidence` gains `source: 'trained' | 'restored'`, `verifiedIds: string[]` and `profile?: string`; the evidence panel labels rechecks. An unmapped movement that a later "Choose different controls" maps has had one recheck plus the armed negative window over the whole set — a deliberate choice. When the 8-entry limit is reached because of unreadable entries, the message points to Delete all. Restore with storage unavailable gives a plain message (tested).

### R7 review record

| Revision | Reviewer | Findings / resolution | Verdict |
| --- | --- | --- | --- |
| R7 revision 1 | r7_review | B1 restore had no typed state/approval gate (approveMapping only gated candidates; mappingSet empty; captureTrial needed choice); B2 no exit at mapping/mapping-confirm, dead record-again in comfort; B3 dwell bounds contradicted `isGestureModel`; B4 Save could silently drop unreadable entries. Rest-compatibility rule and revalidation plan judged correct/adequate. All resolved in revision 2. | CHANGES REQUIRED |
| R7 revision 2 | r7_review (re-review) | B1–B4 resolved against current code; no new blockers. Non-blocking: edit stale revision-1 lines, separate failure kind for profile mismatch, spell out evidence type changes, Delete-all hint, storage-unavailable restore test; adopted. | APPROVED |
| R7 implementation (`fb0fdc4`) | w7a_test_review | Ran tsc, vitest 188, build, browser-check 12/12 itself; code matched R7 rev 2 everywhere checked; 27 of 40 mutants killed. BLOCKING (tests only): unmapped re-check count, another-movement exit from restore comfort, rest rule using only the center, approvedBaseline after restore not pinned. | BLOCKING ISSUES |
| R7 implementation (`fa56d76`) | w7a_test_review (re-check) | Tests `589654f` (+ parser boundaries, valid-mapping duplicate cases), `264baa2`/`fa56d76` assignment-order fix. Ran tsc, vitest 212, build, browser-check 12/12; all 10 previous survivors killed. Non-blocking: order test did not exercise the sort — strengthened in `95c780e` (reverse-ordered saved keys; mutant now killed). Unreachable defence-in-depth guards noted. | PASS — software verified; human acceptance pending |

## R8 — W7b: observed evidence, effort and mapping recommendations (revision 2)

Status: APPROVED (revision 2) by independent `r8_review` re-review; revision 1 had 4 blockers, resolved in "Revision 2 changes" below (stale earlier lines edited to match). Owner: Claude Code coordinator (session 3). Builds on approved R4–R7.

### Goal and limits

Show each person what was actually observed for each of their movements, ask how much effort each takes, and recommend an editable control mapping from that evidence. Recommendations only reorder and pre-fill choices; nothing changes until the existing `mapping-confirm` Approve. All numbers are counts with their denominators from this session's setup and use. No percentages, accuracy, reliability or medical claims, and no population comparisons.

### Evidence model (pure, `src/app/scoring.ts`)

- `AttemptEvidence` gains `expectedId` (the model id), so attempts are attributed by id, not by label (two movements may share a name).
- `MovementEvidence` for an approved model, from the session's cycles plus live use:
  - `checks: { passed, total }` — held-out, cross-check and re-check attempts whose `expectedId` is this model, in `verified`/`approved` cycles whose `verifiedIds` include it (gates: every one had to pass).
  - `everyday: { events, armedMs, windows }` — negative windows of those same cycles (always 0 events; each had to pass). Shown as "0 accidental activations in 21.4 s over 2 everyday checks — each had to pass".
  - `separation` — from the frozen thresholds alone: `fitGesture` sets release = c + 0.25m and activation = c + 0.65m (c = rest ceiling, m = margin), so m = (activation − release)/0.4, c = release − 0.25m and the weakest practice attempt sat at (c + m)/c × the person's resting variation. Shown as "weakest practice attempt: 3.2× your resting variation". Restored models have the same thresholds, so the value is the one from the day they were trained (labelled as such).
  - `effort: 'easy' | 'effort' | 'unknown'` and `tiringReports: number` (see below).
  - `use: { completed, unfinished }` — in `practice`/`communication` with the gesture driver only: `completed` counts runtime events of this model; `unfinished` counts dwells of this model that started and were cancelled (a hold that began but was not completed). Invalid tracking cancellations are not counted against the movement (the runtime invalidation is not a movement outcome).
- No derived rates are displayed; the UI shows the raw counts and denominators. The panel keeps the statement "Observations from this session only — not a measure of future or general accuracy."

### Effort and fatigue (gesture-operable)

- `comfort` (new movement, not restore) offers `comfortable` → "Comfortable and easy" and new `comfortable-effort` → "Comfortable, but it takes effort", then the existing record-again / another-movement / keep-current. Both continue to `mapping`; the answer is stored per model id. Restored profiles keep `unknown` effort (the v1 profile schema does not store effort; no schema change in W7b).
- Communication (gesture mode, two or more movements) gains a scanned control `tiring` → "A movement is tiring", which opens the restricted `tiring` stage where the person names the movement (see Revision 2, B3). Nothing is applied without Approve. Worst-case communication target count becomes 16 (~32 s cycle at 2 s).

### Recommendation (pure)

`recommendMapping(models, evidence): { assignments, mode, reasons: string[] } | null` (null for zero models).
- Rank movements by the revision 2 keys (tiring reports, effort, unfinished-vs-completed cross-product, separation with null last, approval order). Deterministic.
- The best movement selects. Remaining movements with effort `easy`/`unknown` and no tiring reports take next, previous, pause in rank order; movements marked `effort` or reported tiring are left unmapped ("left unused to save effort; it still makes simultaneous movements wait"). If no movement takes `next`, the mode is automatic scanning (validateMapping already derives it).
- Reasons are short plain sentences built only from the counts ("Raise left outer eyebrow selects: easiest for you and 4 of 4 checks passed").
- In `mapping`, the recommendation appears as `map:recommended` directly after `Keep current controls` (if it duplicates an existing proposal, that proposal is moved up and relabelled instead), labelled "Recommended: …". It opens `mapping-confirm` like any proposal.

### Editable mapping (caregiver, conventional)

`MappingView` gains a helper form: one action select per movement (none / select / next / previous / pause). `session.proposeCustom(assignments)` validates with `validateMapping` for the current mapping set; invalid → announced reasons, stage unchanged; valid → `mapping-confirm` with label "Custom: …". Gesture users choose among the scanned proposals (including the recommendation); the custom form is the conventional path for arbitrary combinations.

### Failure modes

Mislabelled attribution (fixed by `expectedId`); counting setup holds as use (only routed stages count); counting tracking loss as an unfinished movement (excluded); a tiring report silently remapping (never: needs Approve); recommending an effortful movement for frequent actions (left unmapped); single-movement users (recommendation = that movement selects, automatic); restored cycles (effort unknown, separation from saved thresholds).

### Tests before advancing

Engine: `cancelCause` for released, band, conflict (including a different movement becoming the single active one while another is pending), invalid (gap, non-finite, stale, `invalidate()`). Pure (`scoring.test.ts`): check/everyday denominators per id from verified/approved cycles only, failed cycles excluded; separation formula against `fitGesture` output and `null` for an edited model; each ranking key in isolation and the tie-break; effort/tiring movements left unmapped and auto mode when no next remains; one movement; deterministic output; no "%", "accuracy" or "reliab" in text. Session: comfort effort choices recorded and both continue; use counters only in practice/communication, `unfinished` only for released/band, tracking loss and conflicts not counted; mapping lists `map:recommended` second with its reasons; choosing it needs confirmation; `tiring` stage lists movements + Never mind, records the chosen one and opens mapping, Never mind returns with the message kept, `tiring:` ids outside the stage do nothing, hidden with one movement; mapping unchanged until Approve; `proposeCustom` only in `mapping`, invalid/valid paths. RTL: evidence summary shows counts with denominators per movement; recommended label/reasons; custom editor submits to confirmation. Then typecheck, build, browser check, independent testing review.

### Revision 2 changes (resolving r8_review)

- **B1 only gate evidence that belongs to the movement.** Held-out/cross-check/re-check attempts and negative windows are pass-required gates: a verified cycle always has every attempt passed and 0 everyday activations. Per-movement evidence therefore counts only cycles whose outcome is `verified`/`approved` and whose `verifiedIds` include the model, and is labelled as gates ("4 of 4 required checks passed · 0 accidental in 21.4 s over 2 everyday checks — each had to pass"). Failed checks and everyday activations are **not** ranking keys and are never attributed to an approved movement; failed cycles stay visible only in the per-cycle evidence list, labelled with what was being set up ("while adding “Open mouth”"). `expectedId` is still added to `AttemptEvidence` for exact attribution.
- **B2 additive engine contract for cancellations.** `RuntimeUpdate` (core file `src/domain/types.ts`, produced by `src/engine/recognition.ts`) gains `cancelledId?: string` and `cancelCause?: 'released' | 'band' | 'conflict' | 'invalid'`; the boolean `cancelled` stays for existing callers. `released`: the pending movement fell back to neutral before its dwell completed; `band`: it dropped into its transition band; `conflict`: another movement made input uncertain; `invalid`: non-finite/missing value, gap, stale/out-of-order time, or `invalidate()`. The session counts `unfinished` only for `released`/`band`, only in routed stages with the gesture driver, and never for session-originated invalidation (stage change, hidden tab, watchdog, non-tracked frames). Engine tests: each cause, including gap/non-finite/stale during a dwell → `invalid`, and a second movement during a dwell → `conflict`.
- **B3 the person names the tiring movement.** With two or more approved movements, the scanned `tiring` control opens a restricted setup stage `tiring` listing each approved movement by name (`tiring:<id>`) plus `Never mind`; scanned by any approved movement (restricted scanner, no communication actions) and rendered as buttons. Choosing a movement records one tiring report for it and enters `mapping` (recommendation recomputed; Keep current controls first). `Never mind` returns to communication with a fresh runtime. With one movement the `tiring` control is not shown (no added scan time); Slower, Pause and Recalibrate already cover that case.
- **B4 guarded separation.** `calibration.ts` exports `RELEASE_FRACTION = 0.25` and `ACTIVATION_FRACTION = 0.65`, used by `fitGesture` and by scoring. Separation is computed only when the derived rest ceiling c > 0 and the ratio is finite; otherwise it is `null`, shown as "not available" and ranked last on that key. Test with a hand-edited (valid-per-runtime) profile model.
- **Ranking keys (revision 2).** In order: fewer tiring reports; effort easy < unknown < effort; fewer unfinished holds relative to completed, compared as `a.unfinished × (b.completed + 1)` vs `b.unfinished × (a.completed + 1)` (movements without use data tie); larger separation (null last); earlier approval order.
- **Adopted from the revision 2 re-review.** Stale revision 1 lines above were edited to match. A different movement becoming the single active one while another is pending is `conflict`. `tiring` is a `Stage`; `never-mind` is a `DecisionId` offered only there; `tiring:<id>` targets are routed only in that stage; it has its own view. Leaving for `tiring` and returning keeps the composed message.
- **Adopted non-blocking.** `completed` counts every completed hold of the movement in routed stages, including holds consumed while paused or unmapped. Proposals including `map:recommended` are computed once on entering `mapping` and stored; the scanned list and `chooseProposal` resolve from that stored list. `proposeCustom` works only in `mapping` and validates against `mappingSet()` (so the restore approval gate still applies). The custom editor is an addition to the scanned proposals and never takes focus from the scanner. Reasons and evidence text are tested to contain no "%", "accuracy" or "reliab". Worst case communication targets: 16 with 2–4 movements (tiring shown), 14 with one movement.

### R8 review record

| Revision | Reviewer | Findings / resolution | Verdict |
| --- | --- | --- | --- |
| R8 revision 1 | r8_review | B1 failed-check/everyday keys are constant for approved movements or misattribute failed cycles; B2 runtime `cancelled` cannot distinguish release from invalidation/conflict; B3 tiring guessed the movement; B4 separation unguarded for edited profiles. Separation derivation confirmed correct for `fitGesture`. All resolved in revision 2. | CHANGES REQUIRED |
| R8 revision 2 | r8_review (re-review) | B1–B4 resolved against current code; no new blockers. Non-blocking: edit stale text, pending-id mismatch → `conflict`, `tiring` stage routing/types/view, keep message across `tiring`; adopted. | APPROVED |
| R8 implementation (`7147850`) | w7b_test_review | Ran tsc, vitest 223, build, browser-check 12/12 itself; no correctness bugs; 31 of 41 mutants killed. BLOCKING (tests only): label-vs-id attribution, adjacent-key precedence and the cross-product, `comfortable` recording easy. | BLOCKING ISSUES |
| R8 implementation (`5464487`) | w7b_test_review (re-check) | Tests `5464487`. Ran tsc, vitest 243, build, browser-check 12/12; M11, M14–M16, M28, M29, M33, M36 killed; 40 of 44 earlier mutants killed, survivors defensive/cosmetic/equivalent. Non-blocking open: defensive cancel-cause counting tests, recommendation published outside `mapping`, restored practice-strength wording. | PASS — software verified; human acceptance pending |

## R9 — W7c: free movement discovery (revision 2)

Status: APPROVED (revision 2) by independent `r9_review` re-review; revision 1 had 2 blockers, resolved in "Revision 2 changes" below (stale earlier lines edited to match). Owner: Claude Code coordinator (session 3). Builds on approved R4–R8.

### Goal and limits

Help a person find movements they can make, without a list, by watching a short period of free exploration and proposing **candidates**. A candidate is only a pre-filled movement choice: it has no model, cannot act, and must go through the unchanged R5/R6 path (three training attempts → frozen fit → held-out (and cross-check) attempts → neutral-armed everyday window → comfort/effort → mapping → `mapping-confirm` Approve). Discovery output is descriptive ("seen 3 times"), never proof of intent and never a score.

### Flow

- `choose` gains `Find my movements` (conventional button; and, when a restricted scanner exists there — adding or recalibrating — a scanned decision `discover`). It needs the current rest baseline (as `choose` already does).
- `discover` (capture stage, in `CAPTURE_STAGES`; communication impossible; any old approved model is not run, exactly like training): prompt "Try any movements you can comfortably make, a few times each, resting in between." It records 20 s of **valid** processed frames (tracked frames only; an invalid frame or a > 250 ms gap ends the current segment and starts a new one; segments are analysed separately, so no episode spans a gap). The interruption cap (5) fails honestly as in R5; Cancel is available. Raw frames stay in memory only for analysis and are dropped as soon as results exist.
- `discover-results`: a list of up to four candidates, each with a plain label, "seen N times", and companions ("moves together with: Purse lips"). Choosing one calls the existing `chooseMovement({feature, direction, label})`, so training starts as if a helper had picked it. Also offered: `Look again` (new discover capture), and `Choose from the full list` (back to `choose`). When adding/recalibrating, the restricted scanner (approved models) offers `discovered:<n>` targets, `discover-again`, `keep-current`; otherwise buttons only (first-run setup is assisted per UA2). With no candidates the view says so plainly and offers Look again / the full list.
- When adding, filtering runs after grouping on (feature, direction) as described in "Revision 2 changes".

### Detection (pure, `src/app/discovery.ts`)

`discoverCandidates(baseline, segments: FeatureFrame[][], approved?: {feature, direction, label}[]): DiscoveryResult` with
`DiscoveryResult = { candidates: Candidate[]; validMs: number; reason: string | null }`,
`Channel = { feature, direction, label }`,
`Candidate = Channel & { episodes: number; companions: Channel[]; alsoMoves: Channel[]; interferesWith: string[] }`.
Channels are the 20 `MOVEMENT_OPTIONS` pairs; thresholds, episodes, time measurement, segment fresh-neutral, the 400 ms minimum, the ≥ 2-episode and ≤ 50 % posture rules, rank-ordered mutual-overlap grouping, `alsoMoves`, ordering (episodes, median `d / on`, `MOVEMENT_OPTIONS` order), the cap of four and the < 10 s rule are as specified in "Revision 2 changes" below. Deterministic.

### Why these choices

Personal thresholds (rest spread and noise) follow R1/R4: no global expression threshold. `on = max(8 × noise, rest + 5 × noise)` is never below what `fitGesture` needs from the baseline (rest ceiling + 3 × noise), so a discovered movement has a realistic chance of training; training can still reject it. Hysteresis, the 400 ms minimum and fresh neutral per segment reject noise, blinks and gap artefacts; the 50 % rule rejects posture changes; grouping turns one physical motion seen by several blendshapes into one candidate without merging independent movements.

### Failure modes

Noise spikes (rejected by duration/hysteresis), posture drift (50 % rule), a single accidental motion (≥ 2 episodes), tracking gaps creating fake episodes (segments analysed separately; episodes cut by segment ends discarded), a movement that duplicates an approved one (filtered when adding), co-moving features silently stealing an old movement (labelled; cross-check enforces), a discovered candidate acting without verification (impossible: no model exists until training, and approval still gates), frames retained (dropped after analysis; never stored).

### Tests before advancing

Pure (`discovery.test.ts`): rest only → none; a repeated mouth opening → one `jawOpen +1` candidate seen N times; jaw and pucker co-moving → one candidate with a companion; two independent movements → two candidates; A–B–C chain stays separate; yaw ± with a shared companion → two candidates; a single episode → none; < 400 ms spikes and blink-like dips → none; a hold cut by a segment end not counted; a hold split by a gap counts 0 times; sustained drift (> 50 %) → none; hysteresis jitter around `on` counts once; sparse segments ignored; < 10 s valid → none with the reason; unreachable `on` skipped; plain labels only; adding filter/marking; cap 4; deterministic. Session: `choose` → discover → results; choosing a candidate enters `training` with that choice and nothing approved; discovery creates no model and communication stays impossible; cancel and interruption cap; when adding, approved movements filtered, scanned `discovered:<n>` selection by an approved movement, `keep-current` exits; frames dropped (snapshot holds only candidate summaries). RTL: results list, empty state. Then typecheck, build, browser check, independent testing review.

### Revision 2 changes (resolving r9_review)

- **B1 rank-ordered grouping on mutual overlap, no chaining.** Channels that pass the movement rules are ranked (episodes desc, median `d / on` desc, `MOVEMENT_OPTIONS` order). Walking that list, each still-unassigned channel becomes a primary; an unassigned channel joins that primary's group only when the shared episode time is ≥ 0.6 of **each** channel's own episode time (min and max), and never when it is the same feature in the other direction. Nothing joins through a non-primary, so there is no transitive chaining. Separately and non-exclusively, `alsoMoves` lists other passing channels whose shared time is ≥ 0.6 of the smaller one's (descriptive only, "moves together with"). Tests: an A–B–C chain with A and C independent and B firing during both keeps A and C separate candidates; yaw ± with a shared companion gives two candidates.
- **B2 plain channels only.** Channels are exactly the 20 (feature, direction) pairs in `MOVEMENT_OPTIONS`, so every candidate and companion has a reviewed plain label; a test asserts no label contains a raw feature id.
- **Thresholds (adopted).** `rest = max(|low − center|, |high − center|)`; `on = max(8 × noise, rest + 5 × noise)` (always ≥ what `fitGesture` needs: rest ceiling + 3 × noise, without the 2 × rest over-strictness that made bounded coefficients like eye closure undiscoverable); `off = on / 2` but never below `rest` (so leaving an episode means back inside the resting range). A channel whose `on` exceeds its reachable range (coefficients > 1 − center for +1, or < center for −1) is skipped.
- **Time and segments (adopted).** All durations are sums of inter-frame intervals inside one segment. An episode runs from its first frame with `d ≥ on` to its first frame with `d < off`; overlap, episode time and the posture rule use kept episodes / in-segment intervals only. Each segment must pass the existing density rule (≥ 1 frame per 125 ms; else it is ignored and its time is not counted as valid). A channel can only start an episode in a segment after an observed `d < off` there (fresh neutral), so a hold split by a gap counts zero times. Minimum episode 400 ms (rejects most natural blinks); test with blink-like 150–350 ms dips about six times in 20 s → no eye candidate.
- **Primary versus companions.** Results show each candidate's primary label with "moves together with: …"; choosing the candidate trains the primary channel. The helper can instead train any group member through a conventional "Use … instead" button (e.g. chin down rather than eye closure). The training prompt keeps showing the chosen label.
- **Session changes (adopted).** `Stage` gains `discover` and `discover-results`; `CAPTURE_STAGES` includes `discover`; `route()` sends `discover` to its own capture; `cancel()` accepts it; `chooseMovement` accepts `discover-results`; `FailureKind` gains `discovery`; `CaptureStatus.kind` gains `discovery`. Entering discovery clears `choice` so `setup-failed` never offers `record-again` for an older choice. The unreachable 60 s valid-time cap is dropped; the 5-interruption cap and Cancel remain.
- **Adding (adopted).** Filtering runs after grouping: a group whose primary equals an approved (feature, direction) is dropped; a group or `alsoMoves` entry containing an approved channel is marked "may interfere with “X” — the cross-check will test this". Adding uses the approved baseline, the same one training uses (documented limitation: head posture may have drifted since; training and cross-checks catch failures).
- **Storage.** Candidates and discovery results are never written to profiles or browser storage.
- **Adopted from the revision 2 re-review.** Stale revision 1 text edited; `Candidate` type written out above; "Use … instead" is also a scanned target when a restricted scanner exists (adding/recalibrating); a channel whose kept episode time lies ≥ 90 % inside other candidates' episodes ranks after independent ones.

### R9 review record

| Revision | Reviewer | Findings / resolution | Verdict |
| --- | --- | --- | --- |
| R9 revision 1 | r9_review | B1 grouping chained through shared channels (opposite directions and independent movements could merge); B2 channels outside `MOVEMENT_OPTIONS` gave jargon labels. Units, hysteresis, safety, privacy and accessibility confirmed sound. Resolved in revision 2 with the non-blocking items adopted. | CHANGES REQUIRED |
| R9 revision 2 | r9_review (re-review) | B1/B2 resolved; thresholds, time/segment rules and session changes checked against the code; no new blockers. Non-blocking (stale text, Candidate type, scanned "use instead", broad-channel ranking) adopted. | APPROVED |

## R10 — W8: demo and accessibility hardening (revision 2)

Status: revision 2 awaiting independent re-review; revision 1 had 4 blockers (r10_review), resolved in "Revision 2 changes" below, which override earlier R10 text where they differ. Owner: Claude Code coordinator (session 3). Builds on approved R4–R9. No new product behaviour: W8 adds automated evidence, small robustness fixes the checks reveal, run instructions, documented limits and a manual acceptance checklist. Human/hardware criteria stay pending.

### Automated evidence to add

1. **Demo Person A and Person B without code changes (session integration, `src/app/demo.test.ts`).** Person A: one movement (brow), automatic scanning, saved as "Person A". Person B: two movements (mouth selects, cheek puff moves next), step scanning, edited phrase, saved as "Person B". A fresh session on the same storage restores A, communicates and speaks; another fresh session restores B, steps and speaks; B then approves a one-movement fallback (mouth alone) and still communicates. A third session uses assisted Space with no movement at all (zero gestures). Only public session APIs and the shared in-memory storage are used.
2. **Noise and lighting-like drift (session).** Deterministic pseudo-random jitter (fixed-seed LCG, ±1.5× the rest noise used in fixtures) on every coefficient plus a slow brightness-like drift (small common offset ramp) during rest: calibration either succeeds and then 60 s of noisy rest in communication selects nothing, or it fails with an honest reason — never an action without a held movement. A noisy held movement still selects exactly once per hold.
3. **Tracking flicker (session).** Alternating short tracked/missing bursts (multiple faces, missing, stale) for 30 s in communication with movement attempts in between produce no action and no catch-up; after stable tracking and fresh neutral, one hold selects once.
4. **Browser checks (`scripts/browser-check.mjs`, fake camera only):**
   - model asset blocked (route abort for the `.task` file) → a visible model-load error, assisted input still available, no external requests;
   - `localStorage` that throws (init script) → the app loads, welcome renders, the saved-profiles area says storage is unavailable only if relevant, no console errors;
   - speech absent (headless voices are empty; additionally stub `speechSynthesis.getVoices` to `[]`) → after assisted selection and Speak, the "no local speech voice" explanation is visible and the message text stays on screen;
   - focus visibility: after Tab, the focused control has a non-`none` outline or a box-shadow;
   - contrast: computed text/background pairs for body text, primary and quiet buttons, the scan highlight and status notices meet WCAG AA 4.5:1 (3:1 for ≥ 24 px or bold ≥ 18.66 px), computed in-page from `getComputedStyle` (walking up to the first opaque background);
   - target size: every visible enabled button on welcome and assisted communication is at least 44 × 44 CSS px;
   - reload: after assisted selections, a reload starts clean (no message, nothing persisted).
5. **Accessible names (RTL).** Every rendered button and form control on each reachable screen in the existing App tests has a non-empty accessible name; exactly one polite live region exists.

Each failing check found here is fixed as a small separate commit (style tokens, sizes, labels or guards), not by weakening the check.

### Documentation

- `README.md`: what Motif is and is not (not a medical device or emergency detector), requirements (desktop Chrome/Edge, webcam, Node ≥ 22.12 for development), setup (`npm ci`, `npm run setup:assets`), run (`npm run dev`, `npm run build` + `npm run preview`), checks (typecheck, tests, browser check with the fake camera and the bundled-Chromium fallback), privacy (local inference, no uploads, opt-in profiles storing only movement settings/controls/phrases/scan speed), supported environment and limitations (English only; one person in view; head-direction labels mathematically derived pending real-camera confirmation; local voices only; synthetic tests do not establish real-world accuracy; no independent first-run setup; observed counts are not accuracy).
- `ACCEPTANCE.md`: the precise manual acceptance checklist for a person with a real webcam, grouped by checkpoint (W2 camera/values/labels, W3 rest + one movement, W4 communication/speech, W5 first-slice flow, W6 two+ movements, W7a save/reload/restore, W7b effort/tiring/recommendation, W7c discovery, W8 Person A/B demo, permission errors, lighting, fatigue, keyboard, contrast, reduced motion, network/storage inspection). Each item: steps, expected result, and blank "observed / date / browser / device" fields. It states that nothing in it has been observed yet.
- `STATUS.md` and `progress.md` updated; `plan.md` W8 status "software verified; human acceptance pending" only after the independent testing review passes.

### Failure modes addressed

Demo needing code edits (A/B via profiles only); noise or flicker producing actions (tests); blocked storage or model assets crashing the app (browser checks); missing speech hiding the message (check); invisible focus, low contrast, small targets (checks + fixes); overstated claims in docs (README limits section, ACCEPTANCE pending fields).

### Revision 2 changes (resolving r10_review)

- **B1 noise, drift and flicker are specified to discriminate.** Jitter is absolute, tied to `featureNoiseFloor(feature)` (coefficients 0.001, angles 0.15°) from a fixed-seed LCG. (a) Light case: uniform jitter of ±4 × floor on every feature during rest, training, checks and use — it **must** calibrate, then 60 s of noisy rest in communication makes **zero** selections, and three noisy holds make **exactly three** selections. (b) Heavy case: rest jitter of ±0.25 on the chosen feature — calibration **must** be rejected with a reason and nothing is approved. (c) Lighting shift after calibration with no adaptation: a common offset on the selected feature below its release threshold for 60 s → zero actions; an offset above its activation threshold held for 20 s → at most one action and none more until fresh neutral (documented limit: recalibrate after large lighting changes). (d) Flicker: 30 s alternating tracked bursts of 400 ms (shorter than the 350 ms rearm + 250 ms dwell) with `missing`/`multiple`/`stale` gaps, with a held movement inside every burst → zero actions; then one stable 3 s burst with one hold → exactly one action, no catch-up.
- **B2 contrast covers every visible text node.** In-page script on every screen the browser can reach (welcome, helper settings open, signal dashboard open, rest-check capture, assisted communication incl. save area hidden/absent, camera-denied state, model-error state) at 1280 px and 900 px wide: every visible element with a direct non-whitespace text node, skipping `.sr-only`, `aria-hidden` subtrees and disabled controls; foreground colour composited with ancestor `opacity`; background = first ancestor with non-transparent background, alpha-blended down to the page; an element or ancestor with a `background-image` before an opaque colour is reported as "unverifiable" (listed, not passed). AA thresholds 4.5:1, or 3:1 for ≥ 24 px or bold ≥ 18.66 px. Focus outline and scan-highlight outline colours must reach 3:1 against the adjacent background. Known failures listed by the reviewer (phrase numbers, gentle note, journey numbers, message placeholder, setup steps, preview caption) are fixed by darkening those tokens in small commits; nothing is excluded to pass. Screens after calibration are not reachable with the fake camera (no face) and are covered by RTL plus the manual checklist.
- **B3 focus visibility is checked against the unfocused style.** Walk the full Tab order on welcome and assisted communication (bounded at 80 stops, cycle detection = no trap): at each stop the focused element must have `outline-style ≠ none` with `outline-width ≥ 2px` **or** an outline/box-shadow that differs from the same element's unfocused computed style; and focus must never land on a hidden element. A global `:focus-visible` outline (≥ 3 px, 3:1) is added if any stop fails.
- **B4 evidence map.** `ACCEPTANCE.md` and README link a table: each plan W8 item → automated test file/check name (or "manual only") → ACCEPTANCE row. Comfort/fatigue → existing comfort reject/retrain tests (R5/R6), `comfortable-effort` and `tiring` tests (R8), plus a README limit: no automatic fatigue detection; Pause, Slower and "A movement is tiring" are the tools. Reduced motion and camera denial point to the existing browser checks.
- **Adopted non-blocking.** One app announcer (`App.tsx` live region) plus `role="status"` notices; `pageerror` counted with console errors; storage-throwing check asserts the page loads and the welcome renders and no saved-profiles error appears unless profiles exist (none here) — Save's `UNAVAILABLE` reason is covered by unit tests; speech stub also counts `speechSynthesis.speak` calls (must be 0); target-size and contrast at 1280 px and 900 px; model `.task` and `/mediapipe/wasm/*` aborts each give the model error; `getUserMedia` stubs for NotFoundError, NotReadableError and missing `mediaDevices` each give a plain message with assisted input available; reload checks: corrupted saved payload shows as unreadable; a seeded valid profile lists "Restore" and stays unarmed (restore needs the camera and goes to the rest check — with the fake camera the rest check never progresses, which is the fail-closed expectation); demo test asserts restore is unarmed until re-check approval and that A's movement does nothing in B's session; README documents Enter for buttons in assisted mode (Space is the switch) and ACCEPTANCE includes it; minimum rendered text size 12 px for user-facing text (checked with contrast); README states Node 22.12+ or 24.

### R10 review record

| Revision | Reviewer | Findings / resolution | Verdict |
| --- | --- | --- | --- |
| R10 revision 1 | r10_review | B1 noise/drift/flicker could pass vacuously (zero fixture noise, either-outcome acceptance, no post-calibration shift, bursts long enough to act); B2 contrast list hand-picked (several real AA failures outside it); B3 focus check satisfied by permanent shadows; B4 no item→evidence map, fatigue evidence missing. Resolved in revision 2 with non-blocking items adopted. | CHANGES REQUIRED |
