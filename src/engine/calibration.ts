import {
  FEATURE_IDS, type Baseline, type FeatureFrame, type FeatureId, type GestureModel,
  type Result, type TrainingTrial,
} from '../domain/types'
import { featureNoiseFloor, quantile, validateStream } from './features'

/** Minimum uninterrupted settled movement evidence per training trial (matches the per-phase minimum). */
export const SETTLED_MOVEMENT_MS = 600

/**
 * A movement prompt includes the person's reaction and onset time. Like the settled
 * rest halves, assess only the last two-thirds of the prompted movement, split by time.
 */
export function settledMovement(movement: readonly FeatureFrame[]): FeatureFrame[] {
  if (!movement.length) return []
  const start = movement[0]!.timestampMs
  const settledStart = start + (movement[movement.length - 1]!.timestampMs - start) / 3
  return movement.filter((frame) => frame.timestampMs >= settledStart)
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
      // The prompt includes the return transition; use its settled half to assess rest.
      const middle = (rest[0]!.timestampMs + rest[rest.length - 1]!.timestampMs) / 2
      const settled = rest.filter((frame) => frame.timestampMs >= middle)
        .map((frame) => Math.abs(frame.values[feature]! - statistics.center))
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
  const baselineRestLimit = Math.max(6 * statistics.noise,
    2 * Math.abs(statistics.low - statistics.center), 2 * Math.abs(statistics.high - statistics.center))
  if (stableRestPhases.some((phase) => quantile(phase, 0.9) > baselineRestLimit)) {
    return { ok: false, reasons: ['An attempt did not return to the personal resting baseline.'] }
  }
  const restCeiling = Math.max(3 * statistics.noise,
    Math.abs(statistics.low - statistics.center), Math.abs(statistics.high - statistics.center), quantile(rests, 0.95))
  const weakestMovement = Math.min(...movementLows)
  const margin = weakestMovement - restCeiling
  if (!Number.isFinite(margin) || margin < Math.max(3 * statistics.noise, 3 * featureNoiseFloor(feature))) {
    return { ok: false, reasons: ['The movement overlaps resting variation. Try a different comfortable movement or record again.'] }
  }
  const releaseThreshold = restCeiling + margin * RELEASE_FRACTION
  // Every repetition must return to the original baseline, not just to a new held expression.
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
