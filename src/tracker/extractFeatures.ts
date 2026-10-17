import type { FeatureFrame, FeatureId } from '../domain/types'

/** Structural subset of MediaPipe results; this module has no browser dependency. */
export interface FaceResult {
  faceLandmarks: readonly (readonly { x: number; y: number; z: number }[])[]
  faceBlendshapes: readonly {
    categories: readonly { categoryName: string; score: number }[]
  }[]
  facialTransformationMatrixes: readonly {
    rows: number
    columns: number
    data: readonly number[]
  }[]
}

export const BLENDSHAPE_FEATURES = [
  'browOuterUpLeft', 'browOuterUpRight', 'browInnerUp',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeWideLeft', 'eyeWideRight',
  'jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'mouthPucker',
  'mouthFrownLeft', 'mouthFrownRight', 'cheekPuff',
] as const satisfies readonly FeatureId[]

const degrees = 180 / Math.PI

/**
 * MediaPipe serializes its face transform in column-major order. Remove its
 * scale before decomposing intrinsic XYZ rotation into signed angles.
 * These are signal axes, not an anatomical diagnosis or an intention score.
 */
export function extractHeadAngles(matrix: FaceResult['facialTransformationMatrixes'][number]):
  Pick<Record<FeatureId, number>, 'headYaw' | 'headPitch' | 'headRoll'> | null {
  const m = matrix.data
  if (matrix.rows !== 4 || matrix.columns !== 4 || m.length !== 16 || !m.every(Number.isFinite)) return null
  if (Math.abs(m[3]) > 0.001 || Math.abs(m[7]) > 0.001 || Math.abs(m[11]) > 0.001 || Math.abs(m[15] - 1) > 0.001) return null

  const lengths = [Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])]
  if (lengths.some((length) => length < 1e-8)) return null
  const x = [m[0] / lengths[0], m[1] / lengths[0], m[2] / lengths[0]]
  const y = [m[4] / lengths[1], m[5] / lengths[1], m[6] / lengths[1]]
  const z = [m[8] / lengths[2], m[9] / lengths[2], m[10] / lengths[2]]
  const dot = (a: number[], b: number[]) => a.reduce((sum, n, index) => sum + n * b[index], 0)
  const determinant = x[0] * (y[1] * z[2] - y[2] * z[1]) - y[0] * (x[1] * z[2] - x[2] * z[1]) + z[0] * (x[1] * y[2] - x[2] * y[1])
  if (Math.abs(dot(x, y)) > 0.05 || Math.abs(dot(x, z)) > 0.05 || Math.abs(dot(y, z)) > 0.05 || determinant < 0.95) return null
  // At gimbal lock yaw alone cannot distinguish the other two axes reliably.
  if (Math.abs(x[2]) > 0.995) return null
  const headYaw = Math.asin(Math.max(-1, Math.min(1, -x[2]))) * degrees
  const headPitch = Math.atan2(y[2], z[2]) * degrees
  const headRoll = Math.atan2(x[1], x[0]) * degrees
  return { headYaw, headPitch, headRoll }
}

export function extractFeatureFrame(result: FaceResult, timestampMs: number): FeatureFrame {
  const invalid = (tracking: FeatureFrame['tracking']): FeatureFrame => ({ timestampMs, tracking, values: {} })
  if (!Number.isFinite(timestampMs)) return invalid('invalid')
  const { faceLandmarks: faces, faceBlendshapes: shapes, facialTransformationMatrixes: matrices } = result
  if (!Array.isArray(faces) || !Array.isArray(shapes) || !Array.isArray(matrices)) return invalid('invalid')
  if (faces.length > 1 || shapes.length > 1 || matrices.length > 1) return invalid('multiple')
  if (faces.length === 0 && shapes.length === 0 && matrices.length === 0) return invalid('missing')
  if (faces.length !== 1 || shapes.length !== 1 || matrices.length !== 1) return invalid('invalid')
  if (faces[0].length === 0 || !faces[0].every((point: { x: number; y: number; z: number }) => [point.x, point.y, point.z].every(Number.isFinite))) return invalid('invalid')

  const values: Partial<Record<FeatureId, number>> = {}
  const seen = new Set<string>()
  for (const category of shapes[0].categories) {
    if (!(BLENDSHAPE_FEATURES as readonly string[]).includes(category.categoryName)) continue
    if (seen.has(category.categoryName) || !Number.isFinite(category.score) || category.score < 0 || category.score > 1) return invalid('invalid')
    seen.add(category.categoryName)
    values[category.categoryName as FeatureId] = category.score
  }
  if (BLENDSHAPE_FEATURES.some((feature) => values[feature] === undefined)) return invalid('invalid')
  const angles = extractHeadAngles(matrices[0])
  if (!angles) return invalid('invalid')
  return { timestampMs, tracking: 'tracked', values: { ...values, ...angles } }
}
