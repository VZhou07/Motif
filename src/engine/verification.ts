import type { FeatureFrame, GestureModel, VerificationResult } from '../domain/types'
import { validateStream } from './features'
import { GestureRuntime, observeGestures } from './recognition'

function listModels(models: GestureModel | readonly GestureModel[]): readonly GestureModel[] {
  return Array.isArray(models) ? models : [models as GestureModel]
}

export function evaluatePositiveAttempt(
  models: GestureModel | readonly GestureModel[], frames: readonly FeatureFrame[], expectedId?: string,
): VerificationResult {
  const modelList = listModels(models)
  const expected = expectedId ?? modelList[0]?.id
  const validation = validateStream(frames, 1_000)
  if (!validation.ok) return { passed: false, eventCount: 0, validDurationMs: 0, reasons: validation.reasons, events: [] }
  const runtime = new GestureRuntime(modelList)
  const events: VerificationResult['events'] = []
  for (const frame of frames) {
    const update = runtime.step(frame)
    if (update.event) events.push(update.event)
  }
  const reasons: string[] = []
  if (!expected || !modelList.some((model) => model.id === expected)) reasons.push('The requested movement is not in the frozen model set.')
  if (observeGestures(modelList, frames[0]!).kind !== 'neutral') reasons.push('Begin the attempt at rest.')
  if (!runtime.snapshot.armed || !runtime.snapshot.neutral) reasons.push('Return to rest after the movement.')
  if (events.length !== 1 || events[0]?.gestureId !== expected) reasons.push('The attempt must produce exactly one recognition of the intended movement.')
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
