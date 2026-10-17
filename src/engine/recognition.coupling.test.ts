import { describe, expect, it } from 'vitest'
import type { FeatureFrame, GestureModel } from '../domain/types'
import { FeatureProcessor } from './features'
import { makeFrame, stream } from './fixtures.test-support'
import { GestureRuntime, observeGestures } from './recognition'
import { evaluatePositiveAttempt } from './verification'

const mouth: GestureModel = { id: 'mouth', label: 'Open mouth', feature: 'jawOpen', direction: 1,
  baselineCenter: 0.1, activationThreshold: 0.3, releaseThreshold: 0.1, activationMs: 250, releaseMs: 350 }
const heads: GestureModel[] = [
  { ...mouth, id: 'down', label: 'Tilt down', feature: 'headPitch', baselineCenter: 0, activationThreshold: 6, releaseThreshold: 2 },
  { ...mouth, id: 'right', label: 'Turn right', feature: 'headYaw', direction: -1, baselineCenter: 0, activationThreshold: 6, releaseThreshold: 2 },
]

function ramp(primary: GestureModel, secondary: GestureModel): FeatureFrame[] {
  const processor = new FeatureProcessor()
  return stream(0, 5_000).map((frame) => {
    const t = frame.timestampMs
    const amount = Math.min(1, Math.max(0, (t - 800) / 600), Math.max(0, (2_800 - t) / 600))
    const primaryPeak = primary.feature === 'jawOpen' ? 0.55 : 12
    // Both signals cross release before the primary crosses activation.
    const secondaryPeak = secondary.feature === 'jawOpen' ? 0.24 : 4.5
    return processor.process(makeFrame(t, {
      [primary.feature]: primary.baselineCenter + primary.direction * primaryPeak * amount,
      [secondary.feature]: secondary.baselineCenter + secondary.direction * secondaryPeak * amount,
    }))
  })
}

describe('separate mouth and head movements with incidental co-motion (R15)', () => {
  for (const head of heads) {
    for (const primary of [mouth, head]) {
      const secondary = primary === mouth ? head : mouth
      it(`${primary.label} registers once with weaker ${secondary.label} co-motion through the real processor`, () => {
        const models = [mouth, head]
        const frozen = structuredClone(models)
        const frames = ramp(primary, secondary)
        const runtime = new GestureRuntime(models)
        const events = frames.flatMap((frame) => runtime.step(frame).event ?? [])
        expect(events.map((event) => event.gestureId)).toEqual([primary.id])
        expect(evaluatePositiveAttempt(models, frames, primary.id, { startMs: 800, endMs: 3_000 }).passed).toBe(true)
        expect(models).toEqual(frozen)
      })
    }
  }

  it('accepts a secondary just below activation, while equality remains ambiguous', () => {
    const head = heads[0]!
    expect(observeGestures([mouth, head], makeFrame(0, { jawOpen: 0.8, headPitch: 5.999 }))).toEqual({ kind: 'active', gestureId: mouth.id })
    expect(observeGestures([mouth, head], makeFrame(0, { jawOpen: 0.8, headPitch: 6 }))).toEqual({ kind: 'uncertain' })
  })

  it('never arms from multiple transition bands or rearms while weaker co-motion remains', () => {
    const head = heads[0]!
    const runtime = new GestureRuntime([mouth, head])
    for (const frame of stream(0, 1_000, { jawOpen: 0.3, headPitch: 3 })) expect(runtime.step(frame).armed).toBe(false)
    for (const frame of stream(1_050, 500, { jawOpen: 0.8, headPitch: 3 })) expect(runtime.step(frame).event).toBeUndefined()
    for (const frame of stream(1_600, 500)) runtime.step(frame)
    const first = stream(2_150, 600, { jawOpen: 0.8, headPitch: 3 }).flatMap((frame) => runtime.step(frame).event ?? [])
    expect(first).toHaveLength(1)
    for (const frame of stream(2_800, 800, { jawOpen: 0.1, headPitch: 3 })) expect(runtime.step(frame).armed).toBe(false)
    for (const frame of stream(3_650, 600, { jawOpen: 0.8, headPitch: 3 })) expect(runtime.step(frame).event).toBeUndefined()
  })

  it('a single frame of two fully active gestures cancels dwell and needs fresh global rest', () => {
    const head = heads[0]!
    const runtime = new GestureRuntime([mouth, head])
    for (const frame of stream(0, 500)) runtime.step(frame)
    expect(runtime.step(makeFrame(550, { jawOpen: 0.8, headPitch: 3 })).started).toBe(mouth.id)
    expect(runtime.step(makeFrame(600, { jawOpen: 0.8, headPitch: 6 })).cancelled).toBe(true)
    for (const frame of stream(650, 900, { jawOpen: 0.8, headPitch: 3 })) expect(runtime.step(frame).event).toBeUndefined()
    for (const frame of stream(1_600, 500)) runtime.step(frame)
    expect(stream(2_150, 600, { jawOpen: 0.8, headPitch: 3 }).flatMap((frame) => runtime.step(frame).event ?? [])).toHaveLength(1)
  })

  it('does not explain an unrelated opposite excursion using another positive band', () => {
    const runtime = new GestureRuntime([mouth, heads[0]!])
    for (const frame of stream(0, 500)) runtime.step(frame)
    expect(runtime.step(makeFrame(550, { jawOpen: 0.3, headPitch: -3 })).phase).toBe('unarmed')
  })
})
