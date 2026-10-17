import { describe, expect, it } from 'vitest'
import type { FeatureFrame, GestureModel } from '../domain/types'
import { GestureRuntime, observeGestures } from './recognition'
import { makeFrame, stream, testModel } from './fixtures.test-support'

function feed(runtime: GestureRuntime, frames: readonly FeatureFrame[]) {
  return frames.map((frame) => runtime.step(frame))
}

describe('gesture input state machine', () => {
  it('requires fresh neutral before activation and emits once per sustained hold', () => {
    const runtime = new GestureRuntime(testModel)
    expect(feed(runtime, stream(0, 1_000, { browOuterUpLeft: 0.8 })).some((update) => update.event)).toBe(false)
    feed(runtime, stream(1_050, 500))
    const held = feed(runtime, stream(1_600, 2_000, { browOuterUpLeft: 0.8 }))
    expect(held.filter((update) => update.event)).toHaveLength(1)
    expect(held[0]?.started).toBe(testModel.id)
    feed(runtime, stream(3_650, 500))
    expect(feed(runtime, stream(4_200, 500, { browOuterUpLeft: 0.8 })).filter((update) => update.event)).toHaveLength(1)
  })

  it('rejects brief spikes, band-only signals and incomplete release', () => {
    const runtime = new GestureRuntime(testModel)
    feed(runtime, stream(0, 500))
    expect(runtime.step(makeFrame(550, { browOuterUpLeft: 0.8 })).started).toBe(testModel.id)
    expect(runtime.step(makeFrame(600)).event).toBeUndefined()
    expect(feed(runtime, stream(650, 300, { browOuterUpLeft: 0.3 })).some((update) => update.event)).toBe(false)
    expect(feed(runtime, stream(1_000, 500, { browOuterUpLeft: 0.8 })).some((update) => update.event)).toBe(false)
  })

  it('preserves prior arming through a gradual positive band without emitting there', () => {
    const runtime = new GestureRuntime(testModel)
    feed(runtime, stream(0, 500))
    expect(feed(runtime, stream(550, 500, { browOuterUpLeft: 0.3 })).every((update) => update.armed && !update.started && !update.event)).toBe(true)
    expect(feed(runtime, stream(1_100, 500, { browOuterUpLeft: 0.8 })).filter((update) => update.event)).toHaveLength(1)
    const unarmed = new GestureRuntime(testModel)
    expect(feed(unarmed, stream(0, 1_000, { browOuterUpLeft: 0.3 })).some((update) => update.armed)).toBe(false)
  })

  it('cancels pending activation falling into the band and requires new neutral', () => {
    const runtime = new GestureRuntime(testModel)
    feed(runtime, stream(0, 500))
    runtime.step(makeFrame(550, { browOuterUpLeft: 0.8 }))
    expect(runtime.step(makeFrame(600, { browOuterUpLeft: 0.3 })).cancelled).toBe(true)
    expect(feed(runtime, stream(650, 500, { browOuterUpLeft: 0.8 })).some((update) => update.event)).toBe(false)
  })

  it('preserves prior arming through sub-activation bands but rejects opposite-only movement', () => {
    const mouth: GestureModel = { ...testModel, id: 'mouth', feature: 'jawOpen' }
    const runtime = new GestureRuntime([testModel, mouth])
    feed(runtime, stream(0, 500))
    const onset = runtime.step(makeFrame(550, { browOuterUpLeft: 0.3, jawOpen: 0.3 }))
    expect(onset.phase).toBe('armed')
    expect(onset.event).toBeUndefined()
    const yaw: GestureModel = { ...testModel, feature: 'headYaw', baselineCenter: 0, activationThreshold: 5, releaseThreshold: 2 }
    const yawRuntime = new GestureRuntime(yaw)
    feed(yawRuntime, stream(0, 500))
    expect(yawRuntime.step(makeFrame(550, { headYaw: -3 })).phase).toBe('unarmed')
  })

  it.each(['missing', 'multiple', 'invalid', 'stale'] as const)('cancels a pending activation on %s tracking', (tracking) => {
    const runtime = new GestureRuntime(testModel)
    feed(runtime, stream(0, 500))
    runtime.step(makeFrame(550, { browOuterUpLeft: 0.8 }))
    expect(runtime.step({ timestampMs: 600, tracking, values: {} }).cancelled).toBe(true)
    expect(feed(runtime, stream(650, 500, { browOuterUpLeft: 0.8 })).some((update) => update.event)).toBe(false)
  })

  it('fails closed on stale, future, repeated, reversed, gapped and nonfinite frames', () => {
    for (const kind of ['age', 'future', 'repeat', 'reverse', 'gap', 'nonfinite'] as const) {
      const runtime = new GestureRuntime(testModel)
      feed(runtime, stream(0, 500))
      runtime.step(makeFrame(550, { browOuterUpLeft: 0.8 }))
      const timestamp = kind === 'repeat' ? 550 : kind === 'reverse' ? 500 : kind === 'gap' ? 900 : 600
      const frame = makeFrame(timestamp, { browOuterUpLeft: kind === 'nonfinite' ? Number.NaN : 0.8 })
      const update = runtime.step(frame, kind === 'age' ? timestamp + 300 : kind === 'future' ? timestamp - 1 : timestamp)
      expect(update.event, kind).toBeUndefined()
      expect(update.phase, kind).toBe('unarmed')
    }
  })

  it('does not transfer an old hold into a different phase', () => {
    const runtime = new GestureRuntime(testModel)
    feed(runtime, stream(0, 500))
    runtime.step(makeFrame(550, { browOuterUpLeft: 0.8 }))
    runtime.invalidate()
    expect(feed(runtime, stream(600, 1_000, { browOuterUpLeft: 0.8 })).some((update) => update.event)).toBe(false)
  })

  it('recognizes opposing models on a shared feature while requiring true neutral', () => {
    const right: GestureModel = { ...testModel, id: 'yaw-right', feature: 'headYaw', baselineCenter: 0, activationThreshold: 5, releaseThreshold: 2 }
    const left: GestureModel = { ...right, id: 'yaw-left', direction: -1 }
    expect(observeGestures([right, left], makeFrame(0, { headYaw: 8 }))).toEqual({ kind: 'active', gestureId: right.id })
    expect(observeGestures([right, left], makeFrame(0, { headYaw: -8 }))).toEqual({ kind: 'active', gestureId: left.id })
    expect(observeGestures([right], makeFrame(0, { headYaw: -8 }))).toEqual({ kind: 'uncertain' })
    const runtime = new GestureRuntime([right, left])
    feed(runtime, stream(0, 500))
    expect(feed(runtime, stream(550, 500, { headYaw: 8 })).filter((update) => update.event)[0]?.event?.gestureId).toBe(right.id)
    expect(feed(runtime, stream(1_100, 500, { headYaw: -8 })).some((update) => update.event)).toBe(false)
    feed(runtime, stream(1_650, 500))
    expect(feed(runtime, stream(2_200, 500, { headYaw: -8 })).filter((update) => update.event)[0]?.event?.gestureId).toBe(left.id)
  })

  it('rejects simultaneous activation while tolerating a weaker cross-feature band', () => {
    const second: GestureModel = { ...testModel, id: 'mouth', feature: 'jawOpen' }
    expect(observeGestures([testModel, second], makeFrame(0, { browOuterUpLeft: 0.8, jawOpen: 0.8 })).kind).toBe('uncertain')
    expect(observeGestures([testModel, second], makeFrame(0, { browOuterUpLeft: 0.8, jawOpen: 0.3 }))).toEqual({ kind: 'active', gestureId: testModel.id })
    const runtime = new GestureRuntime([testModel, second])
    feed(runtime, stream(0, 500))
    expect(feed(runtime, stream(550, 500, { browOuterUpLeft: 0.8, jawOpen: 0.8 })).some((update) => update.event)).toBe(false)
  })

  it('rejects duplicate ids and invalid model thresholds', () => {
    for (const models of [[testModel, testModel], [{ ...testModel, releaseThreshold: 0.4 }]]) {
      const runtime = new GestureRuntime(models)
      expect(feed(runtime, stream(0, 500)).at(-1)?.phase).toBe('unarmed')
    }
  })

  describe('names why a pending dwell ended (R8 B2)', () => {
    const mouth: GestureModel = { ...testModel, id: 'mouth', feature: 'jawOpen' }
    function pending(models: GestureModel | GestureModel[] = testModel) {
      const runtime = new GestureRuntime(models)
      feed(runtime, stream(0, 500))
      expect(runtime.step(makeFrame(550, { browOuterUpLeft: 0.8 })).started).toBe(testModel.id)
      return runtime
    }
    const cause = (update: ReturnType<GestureRuntime['step']>) => [update.cancelled, update.cancelledId, update.cancelCause]

    it('released: back to neutral before the dwell completed', () => {
      expect(cause(pending().step(makeFrame(600)))).toEqual([true, testModel.id, 'released'])
    })
    it('band: the pending movement dropped into its own transition band', () => {
      expect(cause(pending().step(makeFrame(600, { browOuterUpLeft: 0.3 })))).toEqual([true, testModel.id, 'band'])
    })
    it('conflict: another movement joined, or a different movement became the active one', () => {
      expect(cause(pending([testModel, mouth]).step(makeFrame(600, { browOuterUpLeft: 0.8, jawOpen: 0.8 })))).toEqual([true, testModel.id, 'conflict'])
      expect(cause(pending([testModel, mouth]).step(makeFrame(600, { jawOpen: 0.8 })))).toEqual([true, testModel.id, 'conflict'])
      expect(cause(pending([testModel, mouth]).step(makeFrame(600, { jawOpen: 0.3 })))).toEqual([true, testModel.id, 'conflict'])
    })
    it('invalid: gaps, non-finite values, stale time and invalidate()', () => {
      expect(cause(pending().step(makeFrame(900, { browOuterUpLeft: 0.8 })))).toEqual([true, testModel.id, 'invalid'])
      expect(cause(pending().step(makeFrame(600, { browOuterUpLeft: Number.NaN })))).toEqual([true, testModel.id, 'invalid'])
      expect(cause(pending().step(makeFrame(600, { browOuterUpLeft: 0.8 }), 1_000))).toEqual([true, testModel.id, 'invalid'])
      expect(cause(pending().invalidate())).toEqual([true, testModel.id, 'invalid'])
    })
    it('adds no cause when nothing was pending', () => {
      const runtime = new GestureRuntime(testModel)
      feed(runtime, stream(0, 500))
      expect(cause(runtime.step(makeFrame(550)))).toEqual([false, undefined, undefined])
      expect(cause(runtime.invalidate())).toEqual([false, undefined, undefined])
    })
  })
})
