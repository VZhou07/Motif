import { FEATURE_IDS, type FeatureFrame, type FeatureId, type GestureModel, type TrainingTrial } from '../domain/types'

export function makeFrame(timestampMs: number, overrides: Partial<Record<FeatureId, number>> = {}): FeatureFrame {
  return { timestampMs, tracking: 'tracked', values: {
    ...Object.fromEntries(FEATURE_IDS.map((id) => [id, id.startsWith('head') ? 0 : 0.1])), ...overrides,
  } }
}

export function stream(start: number, duration: number, overrides: Partial<Record<FeatureId, number>> = {}, step = 50): FeatureFrame[] {
  return Array.from({ length: Math.floor(duration / step) + 1 }, (_, index) => makeFrame(start + index * step, overrides))
}

export function trial(start: number, movement: Partial<Record<FeatureId, number>> = { browOuterUpLeft: 0.65 }): TrainingTrial {
  return { restBefore: stream(start, 1_000), movement: stream(start + 1_050, 1_000, movement), restAfter: stream(start + 2_100, 1_000) }
}

export const testModel: GestureModel = {
  id: 'left-brow', label: 'Left eyebrow', feature: 'browOuterUpLeft', direction: 1, baselineCenter: 0.1,
  activationThreshold: 0.3, releaseThreshold: 0.1, activationMs: 250, releaseMs: 350,
}
