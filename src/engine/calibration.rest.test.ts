import { describe, expect, it } from 'vitest'
import type { FeatureId, TrainingTrial } from '../domain/types'
import { fitBaseline, fitGesture, settledReturn } from './calibration'
import { FeatureProcessor } from './features'
import { makeFrame, stream, trial } from './fixtures.test-support'

function quietBaseline(feature: FeatureId, center: number) {
  const processor = new FeatureProcessor()
  const result = fitBaseline(stream(0, 10_000).map((frame) => processor.process(makeFrame(frame.timestampMs, {
    [feature]: center + 0.0002 * Math.sin(frame.timestampMs / 180),
  }))))
  if (!result.ok) throw new Error(result.reasons.join(' '))
  return result.value
}

/** Real processing, reaction time and gradual relaxation; later neutral is not an exact baseline copy. */
function relaxedTrial(start: number, feature: FeatureId, center: number, excursion: number, offset: number): TrainingTrial {
  const processor = new FeatureProcessor()
  const noise = feature.startsWith('head') ? 0.08 : 0.002
  const frames = stream(start, 9_000).map((frame) => {
    const elapsed = frame.timestampMs - start
    const neutral = center + offset
    let value = neutral
    if (elapsed >= 3_500 && elapsed < 6_000) {
      value += (center + excursion - neutral) * (1 - Math.exp(-(elapsed - 3_500) / 140))
    } else if (elapsed >= 6_000) {
      // A short response delay, then an exponential return mostly settled after about 700 ms.
      value += (center + excursion - neutral) * Math.exp(-Math.max(0, elapsed - 6_150) / 180)
    }
    return processor.process(makeFrame(frame.timestampMs, { [feature]: value + noise * Math.sin(elapsed / 170) }))
  })
  return {
    restBefore: frames.filter((frame) => frame.timestampMs - start < 3_000),
    movement: frames.filter((frame) => frame.timestampMs - start >= 3_000 && frame.timestampMs - start < 6_000),
    restAfter: frames.filter((frame) => frame.timestampMs - start >= 6_000),
  }
}

function constantTrial(start: number, excursion: number, restOffset: number): TrainingTrial {
  return {
    restBefore: stream(start, 2_950, { browOuterUpLeft: 0.1 + restOffset }),
    movement: stream(start + 3_000, 2_950, { browOuterUpLeft: 0.1 + excursion }),
    restAfter: stream(start + 6_000, 3_000, { browOuterUpLeft: 0.1 + restOffset }),
  }
}

describe('returning to a naturally varying personal rest (R12)', () => {
  const examples: { feature: FeatureId; center: number; excursion: number; offset: number }[] = [
    { feature: 'browOuterUpLeft', center: 0.1, excursion: 0.55, offset: 0.02 },
    { feature: 'browOuterUpRight', center: 0.1, excursion: 0.5, offset: 0.03 },
    { feature: 'jawOpen', center: 0.1, excursion: 0.5, offset: 0.04 },
    { feature: 'mouthSmileRight', center: 0.1, excursion: 0.35, offset: -0.025 },
    { feature: 'eyeBlinkLeft', center: 0.6, excursion: -0.4, offset: 0.03 },
    { feature: 'headYaw', center: 0, excursion: 10, offset: 1.2 },
    { feature: 'headYaw', center: 0, excursion: -10, offset: -1.2 },
    { feature: 'headPitch', center: 0, excursion: -8, offset: 1 },
    { feature: 'headRoll', center: 0, excursion: 9, offset: -0.9 },
  ]

  it.each(examples)('learns $feature excursion $excursion despite later relaxed offset $offset', ({ feature, center, excursion, offset }) => {
    const baseline = quietBaseline(feature, center)
    const original = structuredClone(baseline)
    const result = fitGesture({ baseline, feature, direction: excursion > 0 ? 1 : -1,
      trials: [11_000, 20_100, 29_200].map((start) => relaxedTrial(start, feature, center, excursion, offset)) })
    expect(result.ok, result.ok ? undefined : result.reasons.join(' ')).toBe(true)
    if (!result.ok) return
    expect(result.value.baselineCenter).toBe(baseline.statistics[feature].center)
    expect(result.value.releaseThreshold).toBeGreaterThan(Math.abs(offset))
    expect(result.value.activationThreshold).toBeGreaterThan(result.value.releaseThreshold)
    expect(result.value.activationThreshold).toBeLessThan(Math.abs(excursion))
    expect(baseline).toEqual(original)
  })

  it('allows a small resting shift for a small gesture without imposing an absolute expression threshold', () => {
    const result = fitGesture({ baseline: quietBaseline('browOuterUpLeft', 0.1), feature: 'browOuterUpLeft', direction: 1,
      trials: [11_000, 20_100, 29_200].map((start) => constantTrial(start, 0.04, 0.009)) })
    expect(result.ok, result.ok ? undefined : result.reasons.join(' ')).toBe(true)
    if (result.ok) expect(result.value.activationThreshold).toBeLessThan(0.04)
  })

  it('rejects a resting shift just beyond what that small demonstrated movement can justify', () => {
    const result = fitGesture({ baseline: quietBaseline('browOuterUpLeft', 0.1), feature: 'browOuterUpLeft', direction: 1,
      trials: [11_000, 20_100, 29_200].map((start) => constantTrial(start, 0.04, 0.011)) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons[0]).toMatch(/return/)
  })

  it('rejects one bad short return even when all the longer resting phases are comfortable', () => {
    const trials = [11_000, 20_100, 29_200].map((start) => constantTrial(start, 0.55, 0.02))
    trials[2]!.restAfter = stream(35_200, 700, { browOuterUpLeft: 0.3 })
    const result = fitGesture({ baseline: quietBaseline('browOuterUpLeft', 0.1), feature: 'browOuterUpLeft', direction: 1, trials })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons[0]).toMatch(/return/)
  })

  it('does not let a stronger attempt excuse insufficient return from the weakest attempt', () => {
    const trials = [0.16, 0.36, 0.56].map((excursion, index) => constantTrial(11_000 + index * 9_100, excursion, 0.06))
    const result = fitGesture({ baseline: quietBaseline('browOuterUpLeft', 0.1), feature: 'browOuterUpLeft', direction: 1, trials })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons[0]).toMatch(/return/)
  })

  it('continues rejecting the observed no-return pattern instead of simply deleting the rest check', () => {
    const noReturn = trial(19_000)
    noReturn.restAfter = stream(21_100, 1_000, { browOuterUpLeft: 0.3 })
    const result = fitGesture({ baseline: quietBaseline('browOuterUpLeft', 0.1), feature: 'browOuterUpLeft', direction: 1,
      trials: [trial(11_000), trial(15_000), noReturn] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons[0]).toMatch(/return/)
  })

  it('does not interpret a wrong-direction head movement as a valid gesture after relaxing the rest envelope', () => {
    const result = fitGesture({ baseline: quietBaseline('headYaw', 0), feature: 'headYaw', direction: 1,
      trials: [11_000, 20_100, 29_200].map((start) => relaxedTrial(start, 'headYaw', 0, -10, -1.2)) })
    expect(result.ok).toBe(false)
  })

  it('rejects a large return offset opposite to the gesture instead of considering it neutral', () => {
    const trials = [11_000, 20_100, 29_200].map((start): TrainingTrial => ({
      restBefore: stream(start, 2_950, { browOuterUpLeft: 0.4 }),
      movement: stream(start + 3_000, 2_950, { browOuterUpLeft: 0.9 }),
      restAfter: stream(start + 6_000, 3_000, { browOuterUpLeft: 0.2 }),
    }))
    const result = fitGesture({ baseline: quietBaseline('browOuterUpLeft', 0.4), feature: 'browOuterUpLeft', direction: 1, trials })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons[0]).toMatch(/return/)
  })

  it('rejects a hold released only in the final 400 ms rather than searching for a passing tail', () => {
    const trials = [11_000, 20_100, 29_200].map((start) => constantTrial(start, 0.55, 0.02))
    const last = trials[2]!
    const end = last.restAfter.at(-1)!.timestampMs
    last.restAfter = last.restAfter.map((frame) => makeFrame(frame.timestampMs, {
      browOuterUpLeft: frame.timestampMs < end - 400 ? 0.65 : 0.12,
    }))
    const result = fitGesture({ baseline: quietBaseline('browOuterUpLeft', 0.1), feature: 'browOuterUpLeft', direction: 1, trials })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons[0]).toMatch(/return/)
  })

  it('rejects a sparse return tail even when the entire phase has enough frames on average', () => {
    const trials = [11_000, 20_100, 29_200].map((start) => constantTrial(start, 0.55, 0.02))
    const start = trials[2]!.restAfter[0]!.timestampMs
    trials[2]!.restAfter = [...stream(start, 1_950, { browOuterUpLeft: 0.12 }, 25),
      ...stream(start + 2_000, 1_000, { browOuterUpLeft: 0.12 }, 200)]
    const result = fitGesture({ baseline: quietBaseline('browOuterUpLeft', 0.1), feature: 'browOuterUpLeft', direction: 1, trials })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons).toContain('The camera supplied too few frames for a reliable recording.')
  })
})

describe('fixed settled return window (R12 revision 2)', () => {
  it('uses the last third by timestamps, independent of feature values', () => {
    const frames = stream(10_000, 3_000)
    expect(settledReturn(frames).map((frame) => frame.timestampMs)).toEqual(stream(12_000, 1_000).map((frame) => frame.timestampMs))
    const active = frames.map((frame) => makeFrame(frame.timestampMs, { browOuterUpLeft: 0.8 }))
    expect(settledReturn(active).map((frame) => frame.timestampMs)).toEqual(settledReturn(frames).map((frame) => frame.timestampMs))
    expect(settledReturn([])).toEqual([])
  })

  it('preserves at least 600 ms on short and irregular recordings', () => {
    const irregular = Array.from({ length: 12 }, (_, index) => makeFrame(5_000 + index * 95))
    const tail = settledReturn(irregular)
    expect(tail[0]!.timestampMs).toBe(5_380)
    expect(tail.at(-1)!.timestampMs - tail[0]!.timestampMs).toBe(665)
    expect(settledReturn(stream(0, 600))).toEqual(stream(0, 600))
    expect(settledReturn(stream(0, 1_000))[0]!.timestampMs).toBe(400)
  })
})
