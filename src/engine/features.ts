import { FEATURE_DEFINITIONS, FEATURE_IDS, type FeatureFrame, type FeatureId, type Result } from '../domain/types'

export const MAX_FRAME_GAP_MS = 250
export const SMOOTHING_TIME_MS = 80

export function quantile(values: readonly number[], fraction: number): number {
  if (!values.length) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(1, fraction)) * (sorted.length - 1)
  const low = Math.floor(index)
  return sorted[low]! + (sorted[Math.ceil(index)]! - sorted[low]!) * (index - low)
}

export function featureNoiseFloor(feature: FeatureId): number {
  return FEATURE_DEFINITIONS.find((definition) => definition.id === feature)!.noiseFloor
}

export function isValidFrame(frame: FeatureFrame): boolean {
  if (frame.tracking !== 'tracked' || !Number.isFinite(frame.timestampMs) || frame.timestampMs < 0) return false
  return FEATURE_DEFINITIONS.every(({ id, unit }) => {
    const value = frame.values[id]
    return typeof value === 'number' && Number.isFinite(value)
      && (unit === 'coefficient' ? value >= 0 && value <= 1 : Math.abs(value) <= 180)
  })
}

/** Validates the whole capture. A recovered tail cannot erase an interrupted trial. */
export function validateStream(frames: readonly FeatureFrame[], minimumMs: number): Result<number> {
  if (frames.length < 2 || !Number.isFinite(minimumMs) || minimumMs < 0) {
    return { ok: false, reasons: ['Not enough recorded frames.'] }
  }
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!
    if (!isValidFrame(frame)) return { ok: false, reasons: ['Tracking was interrupted or a signal was invalid.'] }
    if (index > 0) {
      const elapsed = frame.timestampMs - frames[index - 1]!.timestampMs
      if (elapsed <= 0 || elapsed > MAX_FRAME_GAP_MS) {
        return { ok: false, reasons: ['Recorded frames were out of order or too far apart.'] }
      }
    }
  }
  const durationMs = frames[frames.length - 1]!.timestampMs - frames[0]!.timestampMs
  if (durationMs < minimumMs) return { ok: false, reasons: ['More uninterrupted recording time is needed.'] }
  if (frames.length < Math.ceil(durationMs / 125) + 1) {
    return { ok: false, reasons: ['The camera supplied too few frames for a reliable recording.'] }
  }
  return { ok: true, value: durationMs }
}

/** The only smoothing stage: use this same representation during fit, validation and control. */
export class FeatureProcessor {
  private previous: FeatureFrame | undefined

  reset(): void { this.previous = undefined }

  process(frame: FeatureFrame): FeatureFrame {
    if (!isValidFrame(frame)) {
      this.reset()
      return { timestampMs: frame.timestampMs, tracking: frame.tracking === 'tracked' ? 'invalid' : frame.tracking, values: {} }
    }
    const elapsed = this.previous ? frame.timestampMs - this.previous.timestampMs : undefined
    if (elapsed !== undefined && elapsed <= 0) {
      this.reset()
      return { timestampMs: frame.timestampMs, tracking: 'invalid', values: {} }
    }
    if (elapsed !== undefined && elapsed > MAX_FRAME_GAP_MS) {
      this.reset()
      // Expose the gap rather than silently presenting a fresh value as continuous evidence.
      return { timestampMs: frame.timestampMs, tracking: 'stale', values: {} }
    }
    const alpha = elapsed === undefined ? 1 : 1 - Math.exp(-elapsed / SMOOTHING_TIME_MS)
    const values: FeatureFrame['values'] = {}
    for (const feature of FEATURE_IDS) {
      const value = frame.values[feature]!
      const previous = this.previous?.values[feature] ?? value
      values[feature] = previous + alpha * (value - previous)
    }
    const processed: FeatureFrame = { timestampMs: frame.timestampMs, tracking: 'tracked', values }
    this.previous = processed
    return processed
  }
}
