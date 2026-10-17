import { describe, expect, it } from 'vitest'
import { FeatureProcessor, isValidFrame, validateStream } from './features'
import { makeFrame, stream } from './fixtures.test-support'

describe('feature processing', () => {
  it('uses elapsed time rather than a frame-count filter', () => {
    const fast = new FeatureProcessor()
    const slow = new FeatureProcessor()
    fast.process(makeFrame(0))
    slow.process(makeFrame(0))
    fast.process(makeFrame(50, { browOuterUpLeft: 0.8 }))
    const fastResult = fast.process(makeFrame(100, { browOuterUpLeft: 0.8 }))
    const slowResult = slow.process(makeFrame(100, { browOuterUpLeft: 0.8 }))
    expect(fastResult.values.browOuterUpLeft).toBeCloseTo(slowResult.values.browOuterUpLeft!, 10)
  })

  it('fails closed on gaps, reversed times, nonfinite and missing signals', () => {
    const processor = new FeatureProcessor()
    processor.process(makeFrame(0))
    expect(processor.process(makeFrame(300)).tracking).toBe('stale')
    processor.process(makeFrame(350))
    expect(processor.process(makeFrame(340)).tracking).toBe('invalid')
    expect(processor.process(makeFrame(400, { headYaw: Number.NaN })).tracking).toBe('invalid')
    expect(isValidFrame({ ...makeFrame(500), values: { jawOpen: 0.1 } })).toBe(false)
  })

  it('resets without carrying a previous movement through recovery', () => {
    const processor = new FeatureProcessor()
    processor.process(makeFrame(0, { jawOpen: 0.9 }))
    processor.process({ timestampMs: 50, tracking: 'missing', values: {} })
    expect(processor.process(makeFrame(100)).values.jawOpen).toBe(0.1)
  })

  it('rejects low density even if no individual gap is excessive', () => {
    expect(validateStream(stream(0, 10_000, {}, 200), 10_000).ok).toBe(false)
    expect(validateStream(stream(0, 10_000), 10_000).ok).toBe(true)
  })
})
