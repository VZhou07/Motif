import { describe, expect, it } from 'vitest'
import type { GestureModel } from '../domain/types'
import { stream, testModel } from './fixtures.test-support'
import { evaluatePositiveAttempt } from './verification'

const mouth: GestureModel = { ...testModel, id: 'mouth', label: 'Open mouth', feature: 'jawOpen' }
const head: GestureModel = { ...testModel, id: 'head', label: 'Tilt down', feature: 'headPitch', baselineCenter: 0, activationThreshold: 6, releaseThreshold: 2 }
const window = { startMs: 1_050, endMs: 3_000 }
const restBefore = () => stream(0, 1_000)
const restAfter = () => stream(3_000, 1_000)

describe('factual combined-check explanations (R15)', () => {
  it('reports a missed event and observed strength instead of asserting interference', () => {
    const result = evaluatePositiveAttempt([mouth, head], [...restBefore(), ...stream(1_050, 1_900, { jawOpen: 0.2 }), ...restAfter()], mouth.id, window)
    expect(result.passed).toBe(false)
    expect(result.eventCount).toBe(0)
    expect(result.reasons.join(' ')).toContain('No recognition of “Open mouth” occurred during Action.')
    expect(result.reasons.join(' ')).toContain('Observed peak 0.100; activation needs 0.300')
    expect(result.reasons.join(' ')).not.toContain('Multiple movements')
  })
  it('reports actual simultaneous activation with both names', () => {
    const result = evaluatePositiveAttempt([mouth, head], [...restBefore(), ...stream(1_050, 1_900, { jawOpen: 0.8, headPitch: 12 }), ...restAfter()], mouth.id, window)
    expect(result.passed).toBe(false)
    expect(result.reasons.join(' ')).toContain('Multiple movements reached their activation thresholds together: Open mouth, Tilt down')
  })
  it('names the wrong recognized gesture', () => {
    const result = evaluatePositiveAttempt([mouth, head], [...restBefore(), ...stream(1_050, 1_900, { headPitch: 12 }), ...restAfter()], mouth.id, window)
    expect(result.eventCount).toBe(1)
    expect(result.reasons).toContain('Recognized “Tilt down” instead of “Open mouth”.')
  })
  it('counts repeated events rather than implying no event', () => {
    const frames = [...restBefore(), ...stream(1_050, 500, { jawOpen: 0.8 }), ...stream(1_600, 500),
      ...stream(2_150, 800, { jawOpen: 0.8 }), ...restAfter()]
    const result = evaluatePositiveAttempt([mouth, head], frames, mouth.id, window)
    expect(result.eventCount).toBe(2)
    expect(result.reasons.join(' ')).toContain('Detected 2 recognitions during Action')
  })

  it('rejects one ambiguous frame after a correct event, preserving the true event count', () => {
    const frames = [...restBefore(), ...stream(1_050, 1_900, { jawOpen: 0.8 }), ...restAfter()]
      .map((frame) => frame.timestampMs === 2_000 ? { ...frame, values: { ...frame.values, headPitch: 12 } } : frame)
    const result = evaluatePositiveAttempt([mouth, head], frames, mouth.id, window)
    expect(result.passed).toBe(false)
    expect(result.eventCount).toBe(1)
    expect(result.reasons.join(' ')).toContain('Multiple movements reached their activation thresholds together')
    expect(result.reasons.join(' ')).not.toContain('No recognition')
    const frozen = JSON.stringify([mouth, head])
    expect(evaluatePositiveAttempt([mouth, head], frames, mouth.id).passed).toBe(false)
    expect(JSON.stringify([mouth, head])).toBe(frozen)
  })

  it('does not hide two distinct active models that have the same user-chosen name', () => {
    const frames = [...restBefore(), ...stream(1_050, 1_900, { jawOpen: 0.8 }), ...restAfter()]
      .map((frame) => frame.timestampMs === 2_000 ? { ...frame, values: { ...frame.values, headPitch: 12 } } : frame)
    const result = evaluatePositiveAttempt([mouth, { ...head, label: mouth.label }], frames, mouth.id, window)
    expect(result.eventCount).toBe(1)
    expect(result.passed).toBe(false)
    expect(result.reasons.join(' ')).toContain('Multiple movements reached their activation thresholds together: Open mouth, Open mouth')
  })

  it('reports ambiguity even when another movement was recognized first', () => {
    const frames = [...restBefore(), ...stream(1_050, 1_900, { headPitch: 12 }), ...restAfter()]
      .map((frame) => frame.timestampMs === 2_000 ? { ...frame, values: { ...frame.values, jawOpen: 0.8 } } : frame)
    const result = evaluatePositiveAttempt([mouth, head], frames, mouth.id, window)
    expect(result.passed).toBe(false)
    expect(result.reasons.join(' ')).toContain('Multiple movements reached their activation thresholds together')
    expect(result.reasons).toContain('Recognized “Tilt down” instead of “Open mouth”.')
  })
})
