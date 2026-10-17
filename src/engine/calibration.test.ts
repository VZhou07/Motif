import { describe, expect, it } from 'vitest'
import type { TrainingTrial } from '../domain/types'
import { fitBaseline, fitGesture, strongestHold } from './calibration'
import { FeatureProcessor } from './features'
import { makeFrame, stream, trial } from './fixtures.test-support'

function baseline() {
  const result = fitBaseline(stream(0, 10_000))
  if (!result.ok) throw new Error(result.reasons.join(' '))
  return result.value
}

describe('personalized calibration', () => {
  it('records robust baseline statistics with a numerical noise floor', () => {
    const frames = stream(0, 10_000)
    frames[50] = makeFrame(2_500, { browOuterUpLeft: 0.95 })
    const result = fitBaseline(frames)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.durationMs).toBe(10_000)
    expect(result.value.statistics.browOuterUpLeft.center).toBe(0.1)
    expect(result.value.statistics.browOuterUpLeft.noise).toBeGreaterThan(0)
    expect(makeFrame(0, { eyeBlinkLeft: 0.8, eyeBlinkRight: 0.8, winkLeft: 0.9 }).values).toMatchObject({ winkLeft: 0, winkRight: 0 })
    expect(fitBaseline(stream(0, 9_950)).ok).toBe(false)
  })

  it('rejects interrupted, malformed, out-of-order and sparse rest captures', () => {
    const interrupted = stream(0, 10_000)
    interrupted[20] = { timestampMs: 1_000, tracking: 'multiple', values: {} }
    expect(fitBaseline(interrupted).ok).toBe(false)
    expect(fitBaseline([makeFrame(0), makeFrame(10_000)]).ok).toBe(false)
    const reversed = stream(0, 10_000)
    reversed[10] = makeFrame(400)
    expect(fitBaseline(reversed).ok).toBe(false)
  })

  it('learns thresholds from personal repeated movements, with hysteresis', () => {
    const result = fitGesture({ baseline: baseline(), trials: [trial(11_000), trial(15_000), trial(19_000)], feature: 'browOuterUpLeft', direction: 1 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.activationThreshold).toBeGreaterThan(result.value.releaseThreshold)
    expect(result.value.activationThreshold).toBeLessThan(0.55)
    const small = fitGesture({ baseline: baseline(), trials: [trial(11_000, { browOuterUpLeft: 0.14 }), trial(15_000, { browOuterUpLeft: 0.14 }), trial(19_000, { browOuterUpLeft: 0.14 })], feature: 'browOuterUpLeft', direction: 1 })
    expect(small.ok).toBe(true)
    if (small.ok) expect(small.value.activationThreshold).toBeLessThan(result.value.activationThreshold)
  })

  it('learns a comfortable decrease rather than prescribing a movement', () => {
    const result = fitGesture({ baseline: baseline(), trials: [trial(11_000, { headYaw: -8 }), trial(15_000, { headYaw: -7 }), trial(19_000, { headYaw: -9 })], feature: 'headYaw', direction: -1 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.direction).toBe(-1)
  })

  it('rejects weak, inconsistent, wrong-direction and unrested attempts', () => {
    const base = baseline()
    const options = { baseline: base, feature: 'browOuterUpLeft' as const, direction: 1 as const }
    expect(fitGesture({ ...options, trials: [trial(11_000), trial(11_000), trial(11_000)] }).ok).toBe(false)
    expect(fitGesture({ ...options, trials: [trial(11_000, { browOuterUpLeft: 0.102 }), trial(15_000, { browOuterUpLeft: 0.102 }), trial(19_000, { browOuterUpLeft: 0.102 })] }).ok).toBe(false)
    expect(fitGesture({ ...options, trials: [trial(11_000, { browOuterUpLeft: 0.12 }), trial(15_000), trial(19_000)] }).ok).toBe(false)
    expect(fitGesture({ ...options, direction: -1, trials: [trial(11_000), trial(15_000), trial(19_000)] }).ok).toBe(false)
    const bad = trial(19_000)
    bad.restAfter = stream(21_100, 1_000, { browOuterUpLeft: 0.3 })
    expect(fitGesture({ ...options, trials: [trial(11_000), trial(15_000), bad] }).ok).toBe(false)
  })
})

/** Historical 2/3/2.5-second synthetic trial, independent of app pacing. Motion only in [onset, offset]. */
function promptedTrial(start: number, onsetMs: number, offsetMs = 3_000): TrainingTrial {
  const moveStart = start + 2_050
  const movement = stream(moveStart, 3_000).map((frame) => {
    const t = frame.timestampMs - moveStart
    return t >= onsetMs && t <= offsetMs ? makeFrame(frame.timestampMs, { browOuterUpLeft: 0.65 }) : frame
  })
  return { restBefore: stream(start, 2_000), movement, restAfter: stream(start + 5_100, 2_500) }
}

describe('peak-hold movement assessment', () => {
  const options = { feature: 'browOuterUpLeft' as const, direction: 1 as const }

  it('tolerates a normal reaction delay inside the first third of the prompt', () => {
    const result = fitGesture({ ...options, baseline: baseline(), trials: [promptedTrial(11_000, 900), promptedTrial(19_000, 700), promptedTrial(27_000, 950)] })
    expect(result.ok).toBe(true)
  })

  it('fits an 800 ms hold in the first third that last-two-thirds scoring would miss', () => {
    const result = fitGesture({ ...options, baseline: baseline(), trials: [promptedTrial(11_000, 100, 900), promptedTrial(19_000, 80, 880), promptedTrial(27_000, 120, 920)] })
    expect(result.ok, result.ok ? undefined : result.reasons.join(' ')).toBe(true)
  })

  it('rejects a 300 ms spike that never forms a 600 ms hold', () => {
    const result = fitGesture({ ...options, baseline: baseline(), trials: [promptedTrial(11_000, 0, 300), promptedTrial(19_000, 0, 300), promptedTrial(27_000, 0, 300)] })
    expect(result.ok).toBe(false)
  })

  it('does not score a smoothed 150 ms spike plus decay as a hold', () => {
    const spiked = (start: number): TrainingTrial => {
      const processor = new FeatureProcessor()
      const frames = stream(start, 9_000).map((frame) => {
        const elapsed = frame.timestampMs - start
        const brow = elapsed >= 3_000 && elapsed < 3_150 ? 0.7 : 0.1
        return processor.process(makeFrame(frame.timestampMs, { browOuterUpLeft: brow }))
      })
      return {
        restBefore: frames.filter((frame) => frame.timestampMs - start < 3_000),
        movement: frames.filter((frame) => frame.timestampMs - start >= 3_000 && frame.timestampMs - start < 6_000),
        restAfter: frames.filter((frame) => frame.timestampMs - start >= 6_000),
      }
    }
    const result = fitGesture({ ...options, baseline: baseline(), trials: [11_000, 20_100, 29_200].map(spiked) })
    expect(result.ok).toBe(false)
  })

  it('refuses a 600 ms slice with legal gaps but too few frames', () => {
    const frames = [0, 200, 400, 600].map((timestampMs) => makeFrame(timestampMs, { browOuterUpLeft: 0.65 }))
    const result = strongestHold(frames, 'browOuterUpLeft', 1, 0.1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons[0]).toMatch(/longer/)
  })

  it('refuses sparse samples 600 ms apart as a hold', () => {
    const frames = [makeFrame(0), makeFrame(100), makeFrame(200), makeFrame(2_900), makeFrame(3_000)]
    const result = strongestHold(frames, 'browOuterUpLeft', 1, 0.1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons[0]).toMatch(/longer/)
  })

  it('writes a 500 ms dwell onto wink models and 250 ms onto others', () => {
    const wink = fitGesture({ baseline: baseline(), feature: 'winkLeft', direction: 1,
      trials: [trial(11_000, { eyeBlinkLeft: 0.8 }), trial(15_000, { eyeBlinkLeft: 0.8 }), trial(19_000, { eyeBlinkLeft: 0.8 })] })
    expect(wink.ok, wink.ok ? undefined : wink.reasons.join(' ')).toBe(true)
    if (wink.ok) expect(wink.value.activationMs).toBe(500)
    const brow = fitGesture({ baseline: baseline(), feature: 'browOuterUpLeft', direction: 1,
      trials: [trial(11_000), trial(15_000), trial(19_000)] })
    expect(brow.ok).toBe(true)
    if (brow.ok) expect(brow.value.activationMs).toBe(250)
  })

  it('does not treat a two-eye blink as a wink', () => {
    const blink = { eyeBlinkLeft: 0.8, eyeBlinkRight: 0.8 }
    const result = fitGesture({ baseline: baseline(), feature: 'winkLeft', direction: 1,
      trials: [trial(11_000, blink), trial(15_000, blink), trial(19_000, blink)] })
    expect(result.ok).toBe(false)
  })
})
