import { describe, expect, it } from 'vitest'
import type { FeatureFrame, TrainingTrial } from '../domain/types'
import { fitBaseline, fitGesture } from './calibration'
import { FeatureProcessor } from './features'
import { GestureRuntime } from './recognition'
import { ScanController } from './scanner'
import { evaluateNegativeWindow, evaluatePositiveAttempt } from './verification'
import { stream, trial } from './fixtures.test-support'

function processed(frames: readonly FeatureFrame[]) {
  const processor = new FeatureProcessor()
  return frames.map((frame) => processor.process(frame))
}

function processedTrial(raw: TrainingTrial): TrainingTrial {
  const processor = new FeatureProcessor()
  return { restBefore: raw.restBefore.map((frame) => processor.process(frame)),
    movement: raw.movement.map((frame) => processor.process(frame)),
    restAfter: raw.restAfter.map((frame) => processor.process(frame)) }
}

describe('real recognition pipeline with test-only feature streams', () => {
  it('fits, verifies and selects a real scanner target through the same feature processing', () => {
    const baseline = fitBaseline(processed(stream(0, 10_000)))
    expect(baseline.ok).toBe(true)
    if (!baseline.ok) throw new Error(baseline.reasons.join(' '))
    const fitted = fitGesture({ baseline: baseline.value,
      trials: [trial(11_000), trial(15_000), trial(19_000)].map(processedTrial),
      feature: 'browOuterUpLeft', direction: 1 })
    expect(fitted.ok).toBe(true)
    if (!fitted.ok) throw new Error(fitted.reasons.join(' '))
    const frozen = JSON.stringify(fitted.value)
    for (const start of [24_000, 28_000]) {
      const attempt = trial(start)
      expect(evaluatePositiveAttempt(fitted.value, processed([...attempt.restBefore, ...attempt.movement, ...attempt.restAfter])).passed).toBe(true)
    }
    expect(evaluateNegativeWindow(fitted.value, processed(stream(32_000, 11_000))).passed).toBe(true)
    expect(JSON.stringify(fitted.value)).toBe(frozen)
    const runtime = new GestureRuntime(fitted.value)
    const scanner = new ScanController(['I need water', 'Please help me'], 2_000, 44_000)
    const selected: string[] = []
    const attempt = trial(44_000)
    for (const frame of processed([...attempt.restBefore, ...attempt.movement, ...attempt.restAfter])) {
      const update = runtime.step(frame)
      if (update.started) scanner.beginSelection(frame.timestampMs)
      if (update.cancelled) scanner.cancelSelection(frame.timestampMs)
      if (update.event) selected.push(scanner.commitSelection(frame.timestampMs)!)
      scanner.tick(frame.timestampMs)
    }
    expect(selected).toEqual(['I need water'])
  })
})
