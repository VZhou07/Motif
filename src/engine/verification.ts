import type { FeatureFrame, GestureModel, RuntimePhase, VerificationResult } from '../domain/types'
import { validateStream } from './features'
import { GestureRuntime, observeGestures } from './recognition'

function listModels(models: GestureModel | readonly GestureModel[]): readonly GestureModel[] {
  return Array.isArray(models) ? models : [models as GestureModel]
}

/** Half-open Action interval `[startMs, endMs)` from the recorder's movement / rest-after labels. */
export interface ActionWindow { startMs: number; endMs: number }

function windowInvalid(frames: readonly FeatureFrame[], window: ActionWindow): boolean {
  const first = frames[0]!.timestampMs
  const last = frames[frames.length - 1]!.timestampMs
  return !Number.isFinite(window.startMs) || !Number.isFinite(window.endMs) || window.endMs <= window.startMs
    || window.startMs < first || window.endMs > last
}

export function evaluatePositiveAttempt(
  models: GestureModel | readonly GestureModel[], frames: readonly FeatureFrame[], expectedId?: string,
  actionWindow?: ActionWindow,
): VerificationResult {
  const modelList = listModels(models)
  const expected = expectedId ?? modelList[0]?.id
  const validation = validateStream(frames, 1_000)
  if (!validation.ok) return { passed: false, eventCount: 0, validDurationMs: 0, reasons: validation.reasons, events: [] }
  const malformed = actionWindow !== undefined && windowInvalid(frames, actionWindow)
  const runtime = new GestureRuntime(modelList)
  const events: VerificationResult['events'] = []
  const expectedModel = modelList.find((model) => model.id === expected)
  const simultaneous = new Map<string, string>()
  let peak = -Infinity
  let soloSince: number | undefined
  let longestSoloMs = 0
  let preAction: { phase: RuntimePhase; neutral: boolean } | undefined
  for (const frame of frames) {
    const update = runtime.step(frame)
    if (update.event) events.push(update.event)
    if (actionWindow && !malformed && frame.timestampMs < actionWindow.startMs) {
      preAction = { phase: update.phase, neutral: update.neutral }
    }
    const inAction = !malformed && (!actionWindow || frame.timestampMs >= actionWindow.startMs && frame.timestampMs < actionWindow.endMs)
    if (inAction) {
      const active = modelList.filter((model) => model.direction * (frame.values[model.feature]! - model.baselineCenter) >= model.activationThreshold)
      if (active.length > 1) active.forEach((model) => simultaneous.set(model.id, model.label))
      if (expectedModel) peak = Math.max(peak, expectedModel.direction * (frame.values[expectedModel.feature]! - expectedModel.baselineCenter))
      const observation = observeGestures(modelList, frame)
      if (observation.kind === 'active' && observation.gestureId === expected) {
        soloSince ??= frame.timestampMs
        longestSoloMs = Math.max(longestSoloMs, frame.timestampMs - soloSince)
      } else soloSince = undefined
    }
  }
  const reasons: string[] = []
  // A correct early event cannot make a later ambiguous gesture reliable.
  // Labels are editable; distinctness is always based on model IDs.
  if (simultaneous.size > 1) reasons.push(`Multiple movements reached their activation thresholds together: ${[...simultaneous.values()].join(', ')}. No ambiguous input is accepted.`)
  const explainEvents = (observed: VerificationResult['events']): void => {
    const label = expectedModel?.label ?? 'the requested movement'
    if (!observed.length) {
      reasons.push(`No recognition of “${label}” occurred during Action.`)
      if (expectedModel && Number.isFinite(peak)) {
        const unit = expectedModel.feature.startsWith('head') ? '°' : ''
        reasons.push(`Observed peak ${peak.toFixed(3)}${unit}; activation needs ${expectedModel.activationThreshold.toFixed(3)}${unit}. Longest unambiguous hold ${Math.round(longestSoloMs)} ms; required ${expectedModel.activationMs} ms. This measurement does not establish that fresh rest armed the recognizer.`)
      }
    } else if (observed.length > 1) {
      reasons.push(`Detected ${observed.length} recognitions during Action; one “${label}” recognition is required. Relax between holds.`)
    } else {
      const actual = modelList.find((model) => model.id === observed[0]!.gestureId)?.label ?? 'another movement'
      reasons.push(`Recognized “${actual}” instead of “${label}”.`)
    }
    reasons.push('The attempt must produce exactly one recognition of the intended movement.')
  }
  if (!expected || !modelList.some((model) => model.id === expected)) reasons.push('The requested movement is not in the frozen model set.')
  if (malformed) reasons.push('The Action window is invalid.')
  else if (actionWindow) {
    if (preAction?.phase !== 'armed' || !preAction.neutral) reasons.push('Fresh rest did not arm before Action.')
    const inside = events.filter((event) => event.timestampMs >= actionWindow.startMs && event.timestampMs < actionWindow.endMs)
    if (events.some((event) => event.timestampMs < actionWindow.startMs || event.timestampMs >= actionWindow.endMs)) {
      reasons.push('A recognition occurred outside Action.')
    }
    if (inside.length !== 1 || inside[0]?.gestureId !== expected) {
      explainEvents(inside)
    }
  } else {
    if (observeGestures(modelList, frames[0]!).kind !== 'neutral') reasons.push('Begin the attempt at rest.')
    if (events.length !== 1 || events[0]?.gestureId !== expected) {
      explainEvents(events)
    }
  }
  if (!runtime.snapshot.armed || !runtime.snapshot.neutral) reasons.push('Return to rest after the movement.')
  return { passed: reasons.length === 0, eventCount: events.length, validDurationMs: validation.value, reasons, events }
}

export function evaluateNegativeWindow(
  models: GestureModel | readonly GestureModel[], frames: readonly FeatureFrame[], minimumMs = 10_000,
): VerificationResult {
  const validation = validateStream(frames, minimumMs)
  if (!validation.ok) return { passed: false, eventCount: 0, validDurationMs: 0, reasons: validation.reasons, events: [] }
  const runtime = new GestureRuntime(listModels(models))
  let armedAt: number | undefined
  let interrupted = false
  const events: VerificationResult['events'] = []
  for (const frame of frames) {
    const update = runtime.step(frame)
    if (armedAt === undefined && update.armed && update.neutral) armedAt = frame.timestampMs
    else if (armedAt !== undefined && (update.phase === 'unarmed' || update.phase === 'neutral')) interrupted = true
    if (update.event) events.push(update.event)
  }
  const duration = armedAt === undefined ? 0 : frames[frames.length - 1]!.timestampMs - armedAt
  const reasons: string[] = []
  if (armedAt === undefined) reasons.push('Fresh neutral never armed the negative check.')
  if (duration < minimumMs) reasons.push(`Observe at least ${minimumMs / 1_000} seconds after fresh neutral arms the check.`)
  if (events.length > 0) reasons.push('An accidental activation occurred during ordinary activity.')
  if (interrupted) reasons.push('Recognition was interrupted after the negative check armed. Restart the check from rest.')
  return { passed: reasons.length === 0, eventCount: events.length, validDurationMs: duration, reasons, events }
}
