import { describe, expect, it } from 'vitest'
import { evaluateNegativeWindow, evaluatePositiveAttempt } from './verification'
import { makeFrame, stream, testModel } from './fixtures.test-support'

function positive(start = 0) {
  return [...stream(start, 600), ...stream(start + 650, 650, { browOuterUpLeft: 0.8 }), ...stream(start + 1_350, 600)]
}

describe('independent held-out evidence', () => {
  it('evaluates a new attempt without changing the frozen model', () => {
    const before = JSON.stringify(testModel)
    const result = evaluatePositiveAttempt(testModel, positive())
    expect(result.passed).toBe(true)
    expect(result.eventCount).toBe(1)
    expect(JSON.stringify(testModel)).toBe(before)
  })

  it('rejects missed, repeated, wrong and unfinished activations', () => {
    expect(evaluatePositiveAttempt(testModel, stream(0, 2_000)).passed).toBe(false)
    expect(evaluatePositiveAttempt(testModel, [...positive(), ...positive(2_000)]).eventCount).toBe(2)
    expect(evaluatePositiveAttempt(testModel, positive(), 'another').passed).toBe(false)
    expect(evaluatePositiveAttempt(testModel, positive().slice(0, 27)).passed).toBe(false)
  })

  it('cannot hide an interruption behind a later correct event', () => {
    const frames = positive()
    frames[4] = { timestampMs: 200, tracking: 'missing', values: {} }
    expect(evaluatePositiveAttempt(testModel, frames).passed).toBe(false)
    const gapped = positive().filter((frame) => frame.timestampMs < 150 || frame.timestampMs > 500)
    expect(evaluatePositiveAttempt(testModel, gapped).passed).toBe(false)
  })

  it('starts the ten-second negative interval only once fresh neutral arms', () => {
    expect(evaluateNegativeWindow(testModel, stream(0, 10_000)).passed).toBe(false)
    const result = evaluateNegativeWindow(testModel, stream(0, 10_500))
    expect(result.passed).toBe(true)
    expect(result.validDurationMs).toBe(10_150)
    expect(result.eventCount).toBe(0)
  })

  it('reports false activations and refuses blind/interrupted negative windows', () => {
    const activated = stream(0, 11_000).map((frame) => frame.timestampMs >= 3_000 && frame.timestampMs <= 3_500
      ? makeFrame(frame.timestampMs, { browOuterUpLeft: 0.8 }) : frame)
    const result = evaluateNegativeWindow(testModel, activated)
    expect(result.passed).toBe(false)
    expect(result.eventCount).toBe(1)
    const neverArmed = stream(0, 11_000, { browOuterUpLeft: 0.8 })
    expect(evaluateNegativeWindow(testModel, neverArmed).validDurationMs).toBe(0)
    const bandOnly = stream(0, 11_000).map((frame) => frame.timestampMs === 4_000
      ? makeFrame(4_000, { browOuterUpLeft: 0.3 }) : frame)
    expect(evaluateNegativeWindow(testModel, bandOnly).passed).toBe(true)
    const conflicting = stream(0, 11_000).map((frame) => frame.timestampMs === 4_000
      ? makeFrame(4_000, { browOuterUpLeft: 0.3, jawOpen: 0.3 }) : frame)
    expect(evaluateNegativeWindow([testModel, { ...testModel, id: 'mouth', feature: 'jawOpen' }], conflicting).passed).toBe(false)
  })
})
