import {
  FEATURE_IDS, type Baseline, type FeatureFrame, type FeatureId, type GestureModel,
  type Result, type TrainingTrial,
} from '../domain/types'
import { featureNoiseFloor, quantile, validateStream } from './features'

/** Minimum uninterrupted settled movement evidence per training trial (matches the per-phase minimum). */
export const SETTLED_MOVEMENT_MS = 600
export const SETTLED_RETURN_MS = 600

/**
 * A movement prompt includes the person's reaction and onset time. Assess only
 * the last two-thirds of the prompted movement, split by time.
 */
export function settledMovement(movement: readonly FeatureFrame[]): FeatureFrame[] {
  if (!movement.length) return []
  const start = movement[0]!.timestampMs
  const settledStart = start + (movement[movement.length - 1]!.timestampMs - start) / 3
  return movement.filter((frame) => frame.timestampMs >= settledStart)
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

export function fitGesture(options: FitGestureOptions): Result<GestureModel> {
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
  let previousTrialEnd = -1
  for (const trial of trials) {
    for (const phase of [trial.restBefore, trial.movement, trial.restAfter]) {
      const validation = validateStream(phase, 600)
      if (!validation.ok) return { ok: false, reasons: ['A training phase was incomplete.', ...validation.reasons] }
    }
    // Also check the joins. Duplicate, reordered or missing frames cannot hide between labels.
    const entire = validateStream([...trial.restBefore, ...trial.movement, ...trial.restAfter], 1_800)
    if (!entire.ok) return entire
    if (trial.restBefore[0]!.timestampMs <= previousTrialEnd) {
      return { ok: false, reasons: ['Training attempts must be separate recordings, not reused or overlapping data.'] }
    }
    previousTrialEnd = trial.restAfter[trial.restAfter.length - 1]!.timestampMs
    for (const rest of [trial.restBefore, trial.restAfter]) {
      const middle = (rest[0]!.timestampMs + rest[rest.length - 1]!.timestampMs) / 2
      const settledFrames = rest === trial.restAfter ? settledReturn(rest) : rest.filter((frame) => frame.timestampMs >= middle)
      if (rest === trial.restAfter) {
        const validation = validateStream(settledFrames, SETTLED_RETURN_MS)
        if (!validation.ok) return { ok: false, reasons: ['Not enough steady rest was recorded after the movement.', ...validation.reasons] }
      }
      const settled = settledFrames.map((frame) => Math.abs(frame.values[feature]! - statistics.center))
      stableRestPhases.push(settled)
      rests.push(...settled)
    }
    const settled = settledMovement(trial.movement)
    const settledValidation = validateStream(settled, SETTLED_MOVEMENT_MS)
    if (!settledValidation.ok) {
      return { ok: false, reasons: ['Hold the movement a little longer after it starts.', ...settledValidation.reasons] }
    }
    movementLows.push(quantile(settled.map((frame) => direction * (frame.values[feature]! - statistics.center)), 0.25))
  }
  const weakestMovement = Math.min(...movementLows)
  // A quiet initial baseline can have almost no variance. Later relaxed readings
  // need not match it exactly: allow a small part of this person's weakest motion,
  // while keeping the original baseline anchor and rejecting large held residuals.
  const baselineRestLimit = Math.max(6 * statistics.noise,
    2 * Math.abs(statistics.low - statistics.center), 2 * Math.abs(statistics.high - statistics.center),
    RELEASE_FRACTION * weakestMovement)
  if (stableRestPhases.some((phase) => quantile(phase, 0.9) > baselineRestLimit)) {
    return { ok: false, reasons: ['An attempt did not return to the personal resting baseline.'] }
  }
  const restCeiling = Math.max(3 * statistics.noise,
    Math.abs(statistics.low - statistics.center), Math.abs(statistics.high - statistics.center), quantile(rests, 0.95))
  const margin = weakestMovement - restCeiling
  if (!Number.isFinite(margin) || margin < Math.max(3 * statistics.noise, 3 * featureNoiseFloor(feature))) {
    return { ok: false, reasons: ['The movement overlaps resting variation. Try a different comfortable movement or record again.'] }
  }
  const releaseThreshold = restCeiling + margin * RELEASE_FRACTION
  // Every repetition must also fit the learned neutral range around the original baseline.
  if (stableRestPhases.some((phase) => quantile(phase, 0.9) > releaseThreshold)) {
    return { ok: false, reasons: ['An attempt did not return to a stable resting position.'] }
  }
  const strongestMovement = Math.max(...movementLows)
  if (strongestMovement > weakestMovement * 4) {
    return { ok: false, reasons: ['The three movement attempts were too inconsistent. Please retry comfortably.'] }
  }
  return {
    ok: true,
    value: {
      id: options.id ?? `${feature}:${direction}`, label: options.label ?? feature,
      feature, direction, baselineCenter: statistics.center,
      activationThreshold: restCeiling + margin * ACTIVATION_FRACTION, releaseThreshold,
      activationMs: 250, releaseMs: 350,
    },
  }
}
