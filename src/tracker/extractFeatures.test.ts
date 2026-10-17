import { describe, expect, it } from 'vitest'
import { BLENDSHAPE_FEATURES, extractFeatureFrame, extractHeadAngles, type FaceResult } from './extractFeatures'

export function validResult(): FaceResult {
  return {
    faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]],
    faceBlendshapes: [{ categories: BLENDSHAPE_FEATURES.map((categoryName, index) => ({ categoryName, score: (index + 1) / 20 })) }],
    facialTransformationMatrixes: [{ rows: 4, columns: 4, data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, -40, 1] }],
  }
}

describe('feature extraction', () => {
  it('preserves anatomical left/right and includes all finite coefficients', () => {
    const frame = extractFeatureFrame(validResult(), 100)
    expect(frame.tracking).toBe('tracked')
    expect(frame.timestampMs).toBe(100)
    expect(Object.keys(frame.values)).toHaveLength(19)
    expect(frame.values.browOuterUpLeft).toBe(0.05)
    expect(frame.values.browOuterUpRight).toBe(0.1)
    expect(frame.values.eyeBlinkLeft).toBe(0.2)
    expect(frame.values.eyeBlinkRight).toBe(0.25)
    expect(frame.values.winkLeft).toBe(0)
    expect(frame.values.winkRight).toBeCloseTo(0.05)
    expect(frame.values.headYaw).toBeCloseTo(0)
    expect(frame.values.headPitch).toBeCloseTo(0)
    expect(frame.values.headRoll).toBeCloseTo(0)
  })

  it('derives a wink only from a one-eye close, not from a two-eye blink', () => {
    const withBlinks = (left: number, right: number): FaceResult => {
      const result = validResult()
      const categories = result.faceBlendshapes[0].categories.map((category) => {
        if (category.categoryName === 'eyeBlinkLeft') return { ...category, score: left }
        if (category.categoryName === 'eyeBlinkRight') return { ...category, score: right }
        return category
      })
      return { ...result, faceBlendshapes: [{ categories }] }
    }
    const blink = extractFeatureFrame(withBlinks(0.8, 0.8), 10)
    expect(blink.values.winkLeft).toBe(0)
    expect(blink.values.winkRight).toBe(0)
    const left = extractFeatureFrame(withBlinks(0.8, 0.1), 10)
    expect(left.values.winkLeft).toBeCloseTo(0.7)
    expect(left.values.winkRight).toBe(0)
    const right = extractFeatureFrame(withBlinks(0.1, 0.8), 10)
    expect(right.values.winkLeft).toBe(0)
    expect(right.values.winkRight).toBeCloseTo(0.7)
  })

  it('does not fabricate signals for absent, multiple, or inconsistent faces', () => {
    expect(extractFeatureFrame({ faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] }, 0)).toEqual({ timestampMs: 0, tracking: 'missing', values: {} })
    const result = validResult()
    expect(extractFeatureFrame({ ...result, faceLandmarks: [...result.faceLandmarks, ...result.faceLandmarks] }, 0).tracking).toBe('multiple')
    expect(extractFeatureFrame({ ...result, faceBlendshapes: [...result.faceBlendshapes, ...result.faceBlendshapes] }, 0).tracking).toBe('multiple')
    expect(extractFeatureFrame({ ...result, facialTransformationMatrixes: [] }, 0)).toEqual({ timestampMs: 0, tracking: 'invalid', values: {} })
  })

  it.each([NaN, Infinity, -0.1, 1.1])('rejects invalid blendshape score %s', (score) => {
    const result = validResult()
    const categories = result.faceBlendshapes[0].categories.map((category, index) => index === 0 ? { ...category, score } : category)
    expect(extractFeatureFrame({ ...result, faceBlendshapes: [{ categories }] }, 100).tracking).toBe('invalid')
  })

  it('rejects a missing selected representation or duplicate category instead of using zero', () => {
    const result = validResult()
    const categories = result.faceBlendshapes[0].categories
    expect(extractFeatureFrame({ ...result, faceBlendshapes: [{ categories: categories.slice(1) }] }, 0).values).toEqual({})
    expect(extractFeatureFrame({ ...result, faceBlendshapes: [{ categories: [...categories, categories[0]] }] }, 0).tracking).toBe('invalid')
  })

  it('rejects nonfinite landmarks, time, and malformed transforms', () => {
    const result = validResult()
    expect(extractFeatureFrame({ ...result, faceLandmarks: [[{ x: NaN, y: 0, z: 0 }]] }, 0).tracking).toBe('invalid')
    expect(extractFeatureFrame(result, NaN).tracking).toBe('invalid')
    expect(extractFeatureFrame({ ...result, facialTransformationMatrixes: [{ rows: 3, columns: 3, data: [1] }] }, 0).tracking).toBe('invalid')
  })
})

describe('head orientation', () => {
  it.each([
    { label: 'yaw', axis: 'headYaw', data: [0.8660254, 0, -0.5, 0, 0, 1, 0, 0, 0.5, 0, 0.8660254, 0, 0, 0, -40, 1], expected: 30 },
    { label: 'pitch', axis: 'headPitch', data: [1, 0, 0, 0, 0, 0.8660254, -0.5, 0, 0, 0.5, 0.8660254, 0, 0, 0, -40, 1], expected: -30 },
    { label: 'roll', axis: 'headRoll', data: [0.8660254, 0.5, 0, 0, -0.5, 0.8660254, 0, 0, 0, 0, 1, 0, 0, 0, -40, 1], expected: 30 },
  ] as const)('extracts signed $label in degrees from column-major data', ({ axis, data, expected }) => {
    const result = extractHeadAngles({ rows: 4, columns: 4, data })
    expect(result?.[axis]).toBeCloseTo(expected, 5)
  })

  it('removes scale while rejecting reflection and degenerate axes', () => {
    const scaled = [1.7320508, 0, -1, 0, 0, 2, 0, 0, 1, 0, 1.7320508, 0, 0, 0, -40, 1]
    expect(extractHeadAngles({ rows: 4, columns: 4, data: scaled })?.headYaw).toBeCloseTo(30, 5)
    expect(extractHeadAngles({ rows: 4, columns: 4, data: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] })).toBeNull()
    expect(extractHeadAngles({ rows: 4, columns: 4, data: Array.from({ length: 16 }, () => 0) })).toBeNull()
  })

  it('rejects gimbal lock and nonorthogonal axes', () => {
    expect(extractHeadAngles({ rows: 4, columns: 4, data: [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1] })).toBeNull()
    expect(extractHeadAngles({ rows: 4, columns: 4, data: [1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] })).toBeNull()
  })
})
