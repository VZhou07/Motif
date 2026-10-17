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

## R7 — W7a: local profiles and restore (revision 1)

Status: DRAFT, awaiting independent reasoning review before any code. Owner: Claude Code coordinator (session 3). Builds on approved R4–R6. W6 independent testing review runs separately.

### Scope

Opt-in, minimal, versioned local profiles (UA1/UA2): explicit Save with a name, a list of saved profiles, Delete (one or all), strict validation on load, and a disarmed restore that requires a fresh rest check, revalidation of every saved movement, the everyday-activity check and explicit mapping approval before anything can act. Recalibration/remapping/adding already exist (R5/R6) and keep their cancel/keep-current and assisted recovery; W7a only adds that a profile is never changed in storage except by an explicit Save.

### Stored data (and nothing else)

`StoredProfile = { version: 1, featureSchema: string, name: string, models: GestureModel[], mapping: { assignments: Assignments }, phrases: string[], scanIntervalMs: number }`, kept in `localStorage` under one key `motif.profiles` as `{ version: 1, profiles: StoredProfile[] }`.
- `featureSchema` is `FEATURE_IDS.join(',')`, so a model saved for a different feature set is rejected rather than reinterpreted.
- Models are the approved, frozen `GestureModel`s (feature, direction, baseline center, thresholds, dwell times, label, id). They are numbers relative to blendshape coefficients/angles, not images or identity data.
- Never stored: video, frames, baseline statistics, setup evidence, the message being composed, spoken history, camera status, or anything about the device. The rest check is always re-recorded.
- Limits: name 1–40 characters after trimming; at most 8 profiles; Save with an existing name needs explicit `replace`.

### Profile module (pure, `src/app/profiles.ts`)

- `parseProfile(unknown): Result<StoredProfile>` rejects, with readable reasons: a non-object; unknown or missing keys (exact key sets at every level, so nothing extra is ever kept); `version !== 1` ("made by a different version"); schema mismatch; a name outside the limits; 1–4 models; each model's feature not in `FEATURE_IDS`, direction not ±1, any nonfinite number (JSON turns NaN/Infinity into `null`, which also fails), `activationThreshold <= releaseThreshold`, `releaseThreshold <= 0`, dwell times outside 50–5 000 ms, empty/over-60-character label, duplicate ids or duplicate feature+direction; a mapping that fails `validateMapping` for those models; anything other than exactly 6 phrases of 1–60 characters; a scan interval outside `SESSION_LIMITS` bounds or not a multiple of the 500 ms step.
- `profileFromSession({name, models, mapping, phrases, scanIntervalMs})` builds a profile from explicit fields only and runs it through `parseProfile` before it can be written.
- `ProfileStore` port: `list(): { profiles: StoredProfile[]; rejected: number; available: boolean }`, `save(profile, replace): SaveResult`, `remove(name)`, `removeAll()`. `createLocalProfileStore(storage)` wraps a `Storage`-like object; every access is in try/catch so private mode, quota errors or blocked storage give `available: false` or an explicit failure, never a crash. Invalid stored entries are skipped and counted (the UI says "N saved profiles could not be read and were ignored"); corrupt JSON counts as one rejected entry. `createMemoryProfileStore()` serves tests and the default session (so a session without a store saves nothing persistently).

### Session wiring

- `MotifSession` takes an optional `profiles?: ProfileStore`; `useMotif` passes `createLocalProfileStore(window.localStorage)` (guarded). Nothing is written unless `saveProfile` is called.
- `saveProfile(name, replace=false)`: only in `communication` or `practice` with an approved set and mapping (gesture or assisted mode). It is a conventional, caregiver-assisted action (naming needs typing); it is not on the scanner, so a stray gesture can never save or delete. Announces the result (saved / name exists / storage unavailable / limit reached). The snapshot shows `profiles: { names, rejected, available, active, unsaved }`; `unsaved` becomes true when the approved set, mapping, phrases or interval differ from the active profile.
- `deleteProfile(name)` / `deleteAllProfiles()`: conventional with a confirm step in the UI; allowed in any stage; never changes the in-memory approved setup.
- `restoreProfile(name)`: allowed only from `welcome` or `setup-failed` when no setup is approved (a person switching profiles reloads or uses the welcome screen; demo Person A/B in W8 uses this). Needs the camera running. It re-reads and re-validates the profile from the store at that moment, then enters `baseline` with `restoring = profile`. Nothing is armed: `approvedModels`/`mapping` stay empty, so communication and Space-free gesture control are impossible until approval.
- After the fresh rest check, a rest-compatibility check: for every saved model, today's rest must sit inside that model's neutral zone, i.e. `direction * (statistic − baselineCenter)` for the rest `low`, `center` and `high` stays below `releaseThreshold` (and above −`releaseThreshold` on the opposite side, so the rest is not already counted as moving the other way). If not, the restore fails honestly ("Your resting face reads differently from when this profile was saved…") and offers a new setup or assisted input. Thresholds are never re-centred or adapted silently.
- Revalidation (`verify` stage, frozen models, no fitting): the select movement twice, then every other saved movement once, each with `evaluatePositiveAttempt(set, frames, expectedId)` on the whole set; evidence kind `recheck`. Then the 10 s neutral-armed negative window over the set (existing `NegativeMonitor`). Interruption caps, no retry-until-pass and the 60 s caps are as in R5. A cycle records `source: 'restored'` and the profile name.
- `comfort` asks whether the movements are still comfortable (Comfortable / Choose another movement / Do not use this profile), scanned by any movement in the set. Comfortable opens `mapping-confirm` with the saved mapping as the pending proposal (label "Saved controls: …"); `Choose different controls` goes to `mapping` with proposals for the restored set. Only `Approve these controls` arms: then the set, mapping, phrases and scan interval are applied, `active` = the profile name, `previousMapping` is cleared, and practice starts with a fresh runtime (fresh neutral). Any failure, rejection or cancel clears `restoring`, applies nothing, and leaves storage untouched.
- `another-movement` after a failed or rejected restore starts a normal new setup from the fresh rest check; `record-again` is not offered for restores (there is nothing to re-record).

### Failure modes covered

Corrupt/foreign/newer/edited storage; blocked storage; restore of a deleted profile (re-read at restore time fails cleanly); rest that no longer matches; revalidation failure; a profile whose saved mapping is invalid for its models (rejected at parse); a gesture during restore before approval (no action: no approved set); stage changes (fresh neutral as everywhere); a save while capture runs (refused); message/composer text never reaching storage.

### Tests before advancing

Pure (`profiles.test.ts`): round trip; each rejection above (including `null` thresholds from NaN, extra keys, version 2, schema mismatch, 5 models, duplicate movement, invalid mapping, 5 phrases, bad interval/name); store list skips and counts bad entries and corrupt JSON; save/replace/exists/limit; remove/removeAll; storage that throws on get/set gives `available: false` or a failure result, never an exception. Session: save refused before approval and during capture; save stores only allowed keys and never the message; restore requires the camera; restore stays disarmed through every stage (no communication targets, `selectTarget` of a phrase does nothing); rest mismatch fails honestly; recheck plan and kinds; a failed recheck fails; negative window over the set; Approve applies set/mapping/phrases/interval and needs fresh neutral; Choose different controls; reject/cancel applies nothing; a two-movement step profile restores and steps; delete and delete-all; `unsaved` flag. RTL: Save form in communication, profile list with Restore/Delete-confirm on welcome, rejected-count notice. Browser check: still nothing persisted without an explicit Save. Then typecheck, build, independent testing review.

### R7 review record

| Revision | Reviewer | Findings / resolution | Verdict |
| --- | --- | --- | --- |
