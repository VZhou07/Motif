import {
  FEATURE_IDS, type FeatureFrame, type GestureModel, type Observation, type RuntimePhase, type RuntimeUpdate,
} from '../domain/types'
import { isValidFrame, MAX_FRAME_GAP_MS } from './features'

export function isGestureModel(value: unknown): value is GestureModel {
  if (!value || typeof value !== 'object') return false
  const model = value as GestureModel
  return typeof model.id === 'string' && model.id.length > 0 && model.id.length <= 100
    && typeof model.label === 'string' && model.label.length > 0 && model.label.length <= 100
    && FEATURE_IDS.includes(model.feature) && (model.direction === 1 || model.direction === -1)
    && Number.isFinite(model.baselineCenter) && Number.isFinite(model.activationThreshold)
    && Number.isFinite(model.releaseThreshold) && model.releaseThreshold > 0
    && model.activationThreshold > model.releaseThreshold
    && Number.isFinite(model.activationMs) && model.activationMs >= 100 && model.activationMs <= 5_000
    && Number.isFinite(model.releaseMs) && model.releaseMs >= 100 && model.releaseMs <= 5_000
}

export function observeGestures(models: readonly GestureModel[], frame: FeatureFrame): Observation {
  if (!models.length || !models.every(isGestureModel) || !isValidFrame(frame)) return { kind: 'invalid' }
  const projections = models.map((model) => ({ model, distance: model.direction * (frame.values[model.feature]! - model.baselineCenter) }))
  if (projections.every(({ model, distance }) => Math.abs(distance) <= model.releaseThreshold)) return { kind: 'neutral' }
  const active = projections.filter(({ model, distance }) => distance >= model.activationThreshold)
  if (active.length !== 1) return { kind: 'uncertain' }
  const winner = active[0]!
  if (projections.some(({ model, distance }) => model.id !== winner.model.id && distance > model.releaseThreshold)) return { kind: 'uncertain' }
  return { kind: 'active', gestureId: winner.model.id }
}

function isSingleTransitionBand(models: readonly GestureModel[], frame: FeatureFrame): boolean {
  const distances = models.map((model) => ({ model, distance: model.direction * (frame.values[model.feature]! - model.baselineCenter) }))
  return distances.filter(({ model, distance }) => distance > model.releaseThreshold).length === 1
    && distances.every(({ model, distance }) => distance < model.activationThreshold)
}

/** Emits at most once per hold. Only a fresh global neutral dwell can rearm. */
export class GestureRuntime {
  private readonly models: readonly GestureModel[]
  private readonly usable: boolean
  private phase: RuntimePhase = 'unarmed'
  private neutralSince: number | undefined
  private pendingSince: number | undefined
  private pendingId: string | undefined
  private lastTimestamp: number | undefined
  private lastNeutral = false

  constructor(models: GestureModel | readonly GestureModel[]) {
    const list: readonly GestureModel[] = Array.isArray(models) ? models : [models as GestureModel]
    this.models = list.map((model) => ({ ...model }))
    this.usable = this.models.length > 0 && this.models.every(isGestureModel)
      && new Set(this.models.map((model) => model.id)).size === this.models.length
  }

  get snapshot(): RuntimeUpdate {
    return { phase: this.phase, armed: this.phase === 'armed' || this.phase === 'pending', neutral: this.lastNeutral }
  }

  invalidate(): RuntimeUpdate {
    const cancelled = this.phase === 'pending'
    this.phase = 'unarmed'
    this.neutralSince = undefined
    this.pendingSince = undefined
    this.pendingId = undefined
    this.lastTimestamp = undefined
    this.lastNeutral = false
    return { ...this.snapshot, cancelled }
  }

  step(frame: FeatureFrame, nowMs = frame.timestampMs): RuntimeUpdate {
    const elapsed = this.lastTimestamp === undefined ? undefined : frame.timestampMs - this.lastTimestamp
    if (!this.usable || !isValidFrame(frame) || !Number.isFinite(nowMs)
      || nowMs - frame.timestampMs > MAX_FRAME_GAP_MS || frame.timestampMs > nowMs
      || (elapsed !== undefined && (elapsed <= 0 || elapsed > MAX_FRAME_GAP_MS))) return this.invalidate()
    this.lastTimestamp = frame.timestampMs
    const observation = observeGestures(this.models, frame)
    this.lastNeutral = observation.kind === 'neutral'
    // Smoothing makes genuine motion traverse this band. It cannot start a dwell or arm
    // control, but it must not erase an already established neutral arming state.
    if (observation.kind === 'uncertain' && this.phase === 'armed' && isSingleTransitionBand(this.models, frame)) {
      this.neutralSince = undefined
      return this.snapshot
    }
    if (observation.kind === 'invalid' || observation.kind === 'uncertain') {
      const result = this.invalidate()
      // Preserve time continuity validation even while intentionally disarmed.
      this.lastTimestamp = frame.timestampMs
      return result
    }
    if (observation.kind === 'neutral') {
      const cancelled = this.phase === 'pending'
      this.pendingSince = undefined
      this.pendingId = undefined
      if (this.phase !== 'armed') {
        this.neutralSince ??= frame.timestampMs
        this.phase = 'neutral'
        const neutralMs = Math.max(...this.models.map((model) => model.releaseMs))
        if (frame.timestampMs - this.neutralSince >= neutralMs) this.phase = 'armed'
      }
      return { ...this.snapshot, cancelled }
    }
    this.neutralSince = undefined
    if (this.phase === 'armed') {
      this.phase = 'pending'
      this.pendingSince = frame.timestampMs
      this.pendingId = observation.gestureId
      return { ...this.snapshot, started: observation.gestureId }
    }
    if (this.phase === 'pending') {
      if (this.pendingId !== observation.gestureId) {
        const result = this.invalidate()
        this.lastTimestamp = frame.timestampMs
        return result
      }
      const model = this.models.find((candidate) => candidate.id === observation.gestureId)!
      if (frame.timestampMs - this.pendingSince! >= model.activationMs) {
        this.phase = 'held'
        return { ...this.snapshot, event: { gestureId: model.id, timestampMs: frame.timestampMs } }
      }
    } else if (this.phase === 'neutral') {
      this.phase = 'unarmed'
    }
    return this.snapshot
  }
}
