import {
  FEATURE_IDS, WINK_FEATURES, type Baseline, type FeatureFrame, type FeatureId, type GestureModel,
  type Result, type TrainingTrial,
} from '../domain/types'
import { featureNoiseFloor, isValidFrame, MAX_FRAME_GAP_MS, quantile, validateStream } from './features'

/** Minimum uninterrupted settled movement evidence per training trial (matches the per-phase minimum). */
export const SETTLED_MOVEMENT_MS = 600
export const SETTLED_RETURN_MS = 600

/**
 * Strongest valid hold inside Action: every contiguous slice whose timestamp
 * span is at least 600 ms and that passes the same density checks as a settled
 * movement. Rest tails stay time-fixed in `settledReturn`.
 */
export function strongestHold(
  movement: readonly FeatureFrame[],
  feature: FeatureId,
  direction: 1 | -1,
  center: number,
): Result<number> {
  let best: number | undefined
  for (let start = 0; start < movement.length; start += 1) {
    if (!isValidFrame(movement[start]!)) continue
    const signed: number[] = [direction * (movement[start]!.values[feature]! - center)]
    for (let end = start + 1; end < movement.length; end += 1) {
      const previous = movement[end - 1]!
      const frame = movement[end]!
      const gap = frame.timestampMs - previous.timestampMs
      if (!isValidFrame(frame) || gap <= 0 || gap > MAX_FRAME_GAP_MS) break
      signed.push(direction * (frame.values[feature]! - center))
      const span = frame.timestampMs - movement[start]!.timestampMs
      if (span < SETTLED_MOVEMENT_MS || signed.length < Math.ceil(span / 125) + 1) continue
      const score = quantile(signed, 0.25)
      const peak = quantile(signed, 0.75)
      if (peak > Math.max(score, featureNoiseFloor(feature)) * 4) continue
      if (best === undefined || score > best) best = score
    }
  }
  if (best === undefined) return { ok: false, reasons: ['Hold the movement a little longer after it starts.'] }
  return { ok: true, value: best }
}

export function activationMsFor(feature: FeatureId): number {
  return (WINK_FEATURES as readonly FeatureId[]).includes(feature) ? 500 : 250
}

/** Allow the return prompt's recovery time, then assess a fixed, sufficiently long tail. */
export function settledReturn(rest: readonly FeatureFrame[]): FeatureFrame[] {
  if (!rest.length) return []
  const end = rest[rest.length - 1]!.timestampMs
  const duration = end - rest[0]!.timestampMs
  const cutoff = end - Math.max(SETTLED_RETURN_MS, duration / 3)
  let start = rest.findIndex((frame) => frame.timestampMs >= cutoff)
  // Include the preceding boundary sample if frame jitter would trim a 600 ms
  // window too short. Selection depends only on time, never on signal values.
  if (start > 0 && end - rest[start]!.timestampMs < SETTLED_RETURN_MS) start -= 1
  return rest.slice(Math.max(0, start))
}

export function fitBaseline(frames: readonly FeatureFrame[], minimumMs = 10_000): Result<Baseline> {
  const validated = validateStream(frames, minimumMs)
  if (!validated.ok) return validated
  const statistics = {} as Baseline['statistics']
  for (const feature of FEATURE_IDS) {
    const values = frames.map((frame) => frame.values[feature]!)
    const center = quantile(values, 0.5)
    const noise = Math.max(featureNoiseFloor(feature), 1.4826 * quantile(values.map((value) => Math.abs(value - center)), 0.5))
    statistics[feature] = { center, noise, low: quantile(values, 0.05), high: quantile(values, 0.95) }
  }
  return { ok: true, value: { durationMs: validated.value, samples: frames.length, statistics } }
}

export interface FitGestureOptions {
  baseline: Baseline
  trials: readonly TrainingTrial[]
  feature: FeatureId
  direction: 1 | -1
  id?: string
  label?: string
}

/** Thresholds sit at these fractions of the rest-to-weakest-movement margin above the rest ceiling (R8 uses them too). */
export const RELEASE_FRACTION = 0.25
export const ACTIVATION_FRACTION = 0.65

/** Numeric evidence from the same computations used to fit/reject, not raw recordings. */
export interface TrainingDiagnostics {
  feature: FeatureId
  direction: 1 | -1
  baselineCenter: number
  noise: number
  weakestMovement: number
  restLimit: number
  restCeiling: number
  margin: number
  minimumMargin: number
  phases: Array<{ attempt: number; phase: 'before' | 'after'; restDistance: number }>
}

export type GestureFitResult = Result<GestureModel> & { diagnostics?: TrainingDiagnostics }

export function fitGesture(options: FitGestureOptions): GestureFitResult {
  const { baseline, trials, feature, direction } = options
  if (trials.length !== 3) return { ok: false, reasons: ['Record three separate training attempts.'] }
  const statistics = baseline.statistics[feature]
  if (!statistics || !Number.isFinite(statistics.center) || !Number.isFinite(statistics.noise) || statistics.noise <= 0
    || (direction !== 1 && direction !== -1)) {
    return { ok: false, reasons: ['A valid personal baseline and movement direction are required.'] }
  }
  const rests: number[] = []
  const movementLows: number[] = []
  const stableRestPhases: number[][] = []
  const phases: TrainingDiagnostics['phases'] = []
  const restTimestamps = new Set<number>()
  let previousTrial: TrainingTrial | undefined
  for (const trial of trials) {
    for (const phase of [trial.restBefore, trial.movement, trial.restAfter]) {
      const validation = validateStream(phase, 600)
      if (!validation.ok) return { ok: false, reasons: ['A training phase was incomplete.', ...validation.reasons] }
    }
    // Also check the joins. Duplicate, reordered or missing frames cannot hide between labels.
    const entire = validateStream([...trial.restBefore, ...trial.movement, ...trial.restAfter], 1_800)
    if (!entire.ok) return entire
    if (previousTrial && trial.restBefore[0]!.timestampMs <= previousTrial.restAfter.at(-1)!.timestampMs) {
      const shared = previousTrial.restAfter
      const exactNeutral = trial.restBefore.length === shared.length && trial.restBefore.every((frame, index) => {
        const previous = shared[index]!
        return frame.timestampMs === previous.timestampMs && FEATURE_IDS.every((id) => frame.values[id] === previous.values[id])
      })
      if (!exactNeutral || trial.movement[0]!.timestampMs <= previousTrial.restAfter.at(-1)!.timestampMs) {
        return { ok: false, reasons: ['Training attempts must have new movement recordings; only an exact adjacent rest may be shared.'] }
      }
    }
    previousTrial = trial
    for (const rest of [trial.restBefore, trial.restAfter]) {
      // A shared Rest is the same physical interval under both labels. Apply the
      // same settling rule, and don't double-weight its samples in pooled noise.
      const settledFrames = settledReturn(rest)
      const validation = validateStream(settledFrames, SETTLED_RETURN_MS)
      if (!validation.ok) return { ok: false, reasons: ['Not enough steady rest was recorded around the movement.', ...validation.reasons] }
      const settled = settledFrames.map((frame) => Math.abs(frame.values[feature]! - statistics.center))
      stableRestPhases.push(settled)
      phases.push({ attempt: movementLows.length + 1, phase: rest === trial.restBefore ? 'before' : 'after', restDistance: quantile(settled, 0.9) })
      settledFrames.forEach((frame, index) => {
        if (!restTimestamps.has(frame.timestampMs)) rests.push(settled[index]!)
        restTimestamps.add(frame.timestampMs)
      })
    }
    const hold = strongestHold(trial.movement, feature, direction, statistics.center)
    if (!hold.ok) return { ok: false, reasons: hold.reasons }
    movementLows.push(hold.value)
  }
  const weakestMovement = Math.min(...movementLows)
  // A quiet initial baseline can have almost no variance. Later relaxed readings
  // need not match it exactly: allow a small part of this person's weakest motion,
  // while keeping the original baseline anchor and rejecting large held residuals.
  const baselineRestLimit = Math.max(6 * statistics.noise,
    2 * Math.abs(statistics.low - statistics.center), 2 * Math.abs(statistics.high - statistics.center),
    RELEASE_FRACTION * weakestMovement)
  const restCeiling = Math.max(3 * statistics.noise,
    Math.abs(statistics.low - statistics.center), Math.abs(statistics.high - statistics.center), quantile(rests, 0.95))
  const margin = weakestMovement - restCeiling
  const minimumMargin = Math.max(3 * statistics.noise, 3 * featureNoiseFloor(feature))
  const diagnostics: TrainingDiagnostics = { feature, direction, baselineCenter: statistics.center, noise: statistics.noise,
    weakestMovement, restLimit: baselineRestLimit, restCeiling, margin, minimumMargin, phases }
  if (stableRestPhases.some((phase) => quantile(phase, 0.9) > baselineRestLimit)) {
    return { ok: false, reasons: ['An attempt did not return to the personal resting baseline.'], diagnostics }
  }
  if (!Number.isFinite(margin) || margin < minimumMargin) {
    return { ok: false, reasons: ['The movement overlaps resting variation. Try a different comfortable movement or record again.'], diagnostics }
  }
  const releaseThreshold = restCeiling + margin * RELEASE_FRACTION
  // Every repetition must also fit the learned neutral range around the original baseline.
  if (stableRestPhases.some((phase) => quantile(phase, 0.9) > releaseThreshold)) {
    return { ok: false, reasons: ['An attempt did not return to a stable resting position.'], diagnostics }
  }
  const strongestMovement = Math.max(...movementLows)
  if (strongestMovement > weakestMovement * 4) {
    return { ok: false, reasons: ['The three movement attempts were too inconsistent. Please retry comfortably.'], diagnostics }
  }
  return {
    ok: true,
    diagnostics,
    value: {
      id: options.id ?? `${feature}:${direction}`, label: options.label ?? feature,
      feature, direction, baselineCenter: statistics.center,
      activationThreshold: restCeiling + margin * ACTIVATION_FRACTION, releaseThreshold,
      activationMs: activationMsFor(feature), releaseMs: 350,
    },
  }
}
