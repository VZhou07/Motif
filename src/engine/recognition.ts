import {
  FEATURE_IDS, type CancelCause, type FeatureFrame, type GestureModel, type Observation, type RuntimePhase, type RuntimeUpdate,
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

/** The one model in its transition band (above release, nothing at activation), if exactly one is. */
function transitionBandModel(models: readonly GestureModel[], frame: FeatureFrame): GestureModel | undefined {
  const distances = models.map((model) => ({ model, distance: model.direction * (frame.values[model.feature]! - model.baselineCenter) }))
  const above = distances.filter(({ model, distance }) => distance > model.releaseThreshold)
  return above.length === 1 && distances.every(({ model, distance }) => distance < model.activationThreshold) ? above[0]!.model : undefined
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

  invalidate(cause: CancelCause = 'invalid'): RuntimeUpdate {
    const cancelled = this.phase === 'pending'
    const cancelledId = this.pendingId
    this.phase = 'unarmed'
    this.neutralSince = undefined
    this.pendingSince = undefined
    this.pendingId = undefined
    this.lastTimestamp = undefined
    this.lastNeutral = false
    return cancelled ? { ...this.snapshot, cancelled, cancelledId, cancelCause: cause } : { ...this.snapshot, cancelled }
  }

  /** Disarms like `invalidate`, keeping time-continuity validation, and names why a pending dwell ended. */
  private disarm(frame: FeatureFrame, cause: CancelCause): RuntimeUpdate {
    const result = this.invalidate(cause)
    this.lastTimestamp = frame.timestampMs
    return result
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
    const band = observation.kind === 'uncertain' ? transitionBandModel(this.models, frame) : undefined
    if (observation.kind === 'uncertain' && this.phase === 'armed' && band) {
      this.neutralSince = undefined
      return this.snapshot
    }
    // Preserve time continuity validation even while intentionally disarmed.
    if (observation.kind === 'invalid') return this.disarm(frame, 'invalid')
    if (observation.kind === 'uncertain') return this.disarm(frame, band && band.id === this.pendingId ? 'band' : 'conflict')
    if (observation.kind === 'neutral') {
      const cancelled = this.phase === 'pending'
      const cancelledId = this.pendingId
      this.pendingSince = undefined
      this.pendingId = undefined
      if (this.phase !== 'armed') {
        this.neutralSince ??= frame.timestampMs
        this.phase = 'neutral'
        const neutralMs = Math.max(...this.models.map((model) => model.releaseMs))
        if (frame.timestampMs - this.neutralSince >= neutralMs) this.phase = 'armed'
      }
      return cancelled ? { ...this.snapshot, cancelled, cancelledId, cancelCause: 'released' } : { ...this.snapshot, cancelled }
    }
    this.neutralSince = undefined
    if (this.phase === 'armed') {
      this.phase = 'pending'
      this.pendingSince = frame.timestampMs
      this.pendingId = observation.gestureId
      return { ...this.snapshot, started: observation.gestureId }
    }
    if (this.phase === 'pending') {
      if (this.pendingId !== observation.gestureId) return this.disarm(frame, 'conflict')
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
