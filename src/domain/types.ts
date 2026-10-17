export const FEATURE_DEFINITIONS = [
  { id: 'browOuterUpLeft', label: 'Left outer eyebrow', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'browOuterUpRight', label: 'Right outer eyebrow', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'browInnerUp', label: 'Inner eyebrows', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'eyeBlinkLeft', label: 'Left eye closing', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'eyeBlinkRight', label: 'Right eye closing', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'eyeWideLeft', label: 'Left eye opening', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'eyeWideRight', label: 'Right eye opening', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'jawOpen', label: 'Mouth opening', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'mouthSmileLeft', label: 'Left mouth corner up', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'mouthSmileRight', label: 'Right mouth corner up', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'mouthPucker', label: 'Lips pursing', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'mouthFrownLeft', label: 'Left mouth corner down', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'mouthFrownRight', label: 'Right mouth corner down', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'cheekPuff', label: 'Cheeks puffing', unit: 'coefficient', noiseFloor: 0.001 },
  { id: 'headYaw', label: 'Head turning', unit: 'degrees', noiseFloor: 0.15 },
  { id: 'headPitch', label: 'Head tilting up/down', unit: 'degrees', noiseFloor: 0.15 },
  { id: 'headRoll', label: 'Head tilting sideways', unit: 'degrees', noiseFloor: 0.15 },
] as const

export type FeatureId = (typeof FEATURE_DEFINITIONS)[number]['id']
export const FEATURE_IDS: readonly FeatureId[] = FEATURE_DEFINITIONS.map((feature) => feature.id)
export type FeatureValues = Partial<Record<FeatureId, number>>
export type TrackingState = 'tracked' | 'missing' | 'multiple' | 'invalid' | 'stale'

/** All timestamps use the same monotonic millisecond clock as performance.now(). */
export interface FeatureFrame {
  timestampMs: number
  tracking: TrackingState
  values: FeatureValues
}

export interface FeatureStatistics {
  center: number
  noise: number
  low: number
  high: number
}

export interface Baseline {
  durationMs: number
  samples: number
  statistics: Record<FeatureId, FeatureStatistics>
}

/** Thresholds are positive signed distances from this person's baseline, not model scores. */
export interface GestureModel {
  id: string
  label: string
  feature: FeatureId
  direction: 1 | -1
  baselineCenter: number
  activationThreshold: number
  releaseThreshold: number
  activationMs: number
  releaseMs: number
}

export interface TrainingTrial {
  restBefore: readonly FeatureFrame[]
  movement: readonly FeatureFrame[]
  restAfter: readonly FeatureFrame[]
}

export type Result<T> = { ok: true; value: T } | { ok: false; reasons: string[] }

export interface ControlEvent {
  gestureId: string
  timestampMs: number
}

export type Observation =
  | { kind: 'neutral' }
  | { kind: 'active'; gestureId: string }
  | { kind: 'uncertain' }
  | { kind: 'invalid' }

export type RuntimePhase = 'unarmed' | 'neutral' | 'armed' | 'pending' | 'held'
/** Why a pending dwell ended without an event (R8 B2). */
export type CancelCause = 'released' | 'band' | 'conflict' | 'invalid'
export interface RuntimeUpdate {
  phase: RuntimePhase
  armed: boolean
  neutral: boolean
  started?: string
  cancelled?: boolean
  /** Set with `cancelled: true`: the movement whose dwell ended, and why. */
  cancelledId?: string
  cancelCause?: CancelCause
  event?: ControlEvent
}

export interface VerificationResult {
  passed: boolean
  eventCount: number
  validDurationMs: number
  reasons: string[]
  events: ControlEvent[]
}
