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

  it('accepts shared Rest that starts in relaxation when an Action window is supplied', () => {
    const restBefore = [...stream(0, 400, { browOuterUpLeft: 0.8 }), ...stream(450, 4_550)]
    const movement = stream(5_050, 4_900, { browOuterUpLeft: 0.8 })
    const restAfter = stream(10_000, 5_000)
    const frames = [...restBefore, ...movement, ...restAfter]
    const window = { startMs: movement[0]!.timestampMs, endMs: restAfter[0]!.timestampMs }
    const result = evaluatePositiveAttempt(testModel, frames, testModel.id, window)
    expect(result.passed).toBe(true)
    expect(result.eventCount).toBe(1)
    expect(evaluatePositiveAttempt(testModel, frames).passed).toBe(false)
    expect(evaluatePositiveAttempt(testModel, frames).reasons).toContain('Begin the attempt at rest.')
  })

  it('requires armed rest immediately before Action, not a dwell that started in Rest', () => {
    // Hold begins 150 ms before Action so the last Rest frame is still pending, then the
    // dwell completes inside Action (activationMs is 250). That must not pass.
    const restBefore = [...stream(0, 4_850), ...stream(4_900, 100, { browOuterUpLeft: 0.8 })]
    const movement = stream(5_050, 4_900, { browOuterUpLeft: 0.8 })
    const restAfter = stream(10_000, 5_000)
    const frames = [...restBefore, ...movement, ...restAfter]
    const window = { startMs: movement[0]!.timestampMs, endMs: restAfter[0]!.timestampMs }
    const result = evaluatePositiveAttempt(testModel, frames, testModel.id, window)
    expect(result.passed).toBe(false)
    expect(result.eventCount).toBe(1)
    expect(result.reasons).toContain('Fresh rest did not arm before Action.')
  })

  it('rejects events in Rest, missing Action events, extra events and a malformed window', () => {
    const rest = stream(0, 5_000)
    const movement = stream(5_050, 4_900, { browOuterUpLeft: 0.8 })
    const quietAfter = stream(10_000, 5_000)
    const extraAfter = [...stream(10_000, 2_000), ...stream(12_100, 800, { browOuterUpLeft: 0.8 }), ...stream(13_000, 2_000)]
    const window = { startMs: movement[0]!.timestampMs, endMs: quietAfter[0]!.timestampMs }
    expect(evaluatePositiveAttempt(testModel, [...rest, ...movement, ...extraAfter], testModel.id, window).reasons)
      .toContain('A recognition occurred outside Action.')
    expect(evaluatePositiveAttempt(testModel, [...rest, ...stream(5_050, 4_900), ...quietAfter], testModel.id, window).eventCount).toBe(0)
    expect(evaluatePositiveAttempt(testModel, [...rest, ...movement, ...quietAfter], testModel.id, { startMs: 9_000, endMs: 1_000 }).reasons)
      .toContain('The Action window is invalid.')
    expect(evaluatePositiveAttempt(testModel, [...rest, ...movement, ...quietAfter], testModel.id, { startMs: Number.NaN, endMs: 10_000 }).passed)
      .toBe(false)
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
      ? makeFrame(4_000, { browOuterUpLeft: 0.8, jawOpen: 0.8 }) : frame)
    expect(evaluateNegativeWindow([testModel, { ...testModel, id: 'mouth', feature: 'jawOpen' }], conflicting).passed).toBe(false)
  })

  it('a wink model emits nothing during 350 ms two-eye blinks', () => {
    const wink: typeof testModel = {
      ...testModel, id: 'wink-left', feature: 'winkLeft', baselineCenter: 0,
      activationThreshold: 0.25, releaseThreshold: 0.08, activationMs: 500,
    }
    const everyday = stream(0, 11_000).map((frame) => {
      const phase = frame.timestampMs % 1_000
      return phase >= 400 && phase < 750
        ? makeFrame(frame.timestampMs, { eyeBlinkLeft: 0.85, eyeBlinkRight: 0.85 })
        : frame
    })
    const result = evaluateNegativeWindow(wink, everyday)
    expect(result.passed).toBe(true)
    expect(result.eventCount).toBe(0)
  })
})
