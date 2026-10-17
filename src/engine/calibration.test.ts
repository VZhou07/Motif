import { describe, expect, it } from 'vitest'
import type { TrainingTrial } from '../domain/types'
import { fitBaseline, fitGesture, settledMovement } from './calibration'
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

describe('settled movement assessment', () => {
  const options = { feature: 'browOuterUpLeft' as const, direction: 1 as const }

  it('tolerates a normal reaction delay inside the first third of the prompt', () => {
    const result = fitGesture({ ...options, baseline: baseline(), trials: [promptedTrial(11_000, 900), promptedTrial(19_000, 700), promptedTrial(27_000, 950)] })
    expect(result.ok).toBe(true)
  })

  it('rejects a movement made only at the start of the prompt and then released', () => {
    const result = fitGesture({ ...options, baseline: baseline(), trials: [promptedTrial(11_000, 0, 900), promptedTrial(19_000, 0, 900), promptedTrial(27_000, 0, 900)] })
    expect(result.ok).toBe(false)
  })

  it('rejects a settled portion shorter than the minimum evidence span', () => {
    const short = (start: number): TrainingTrial => ({ restBefore: stream(start, 1_000),
      movement: stream(start + 1_050, 700, { browOuterUpLeft: 0.65 }), restAfter: stream(start + 1_800, 1_000) })
    const result = fitGesture({ ...options, baseline: baseline(), trials: [short(11_000), short(15_000), short(19_000)] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reasons[0]).toMatch(/longer/)
  })

  it('splits the settled portion by timestamp rather than frame index', () => {
    const frames = [makeFrame(0), makeFrame(100), makeFrame(200), makeFrame(2_900), makeFrame(3_000)]
    expect(settledMovement(frames).map((frame) => frame.timestampMs)).toEqual([2_900, 3_000])
    expect(settledMovement([])).toEqual([])
  })
})
