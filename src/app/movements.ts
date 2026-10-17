import type { Baseline, FeatureFrame, FeatureId } from '../domain/types';
import type { MovementChoice } from './types';

export interface MovementOption extends MovementChoice {
  region: 'Eyebrows' | 'Eyes' | 'Mouth' | 'Cheeks' | 'Head';
}

/**
 * Sides are the person's anatomical sides (MediaPipe subject convention; the detector
 * receives unmirrored video). Head directions are derived from the transform math in
 * extractHeadAngles and still need real-camera confirmation (see progress.md).
 */
export const MOVEMENT_OPTIONS: readonly MovementOption[] = [
  { region: 'Eyebrows', feature: 'browOuterUpLeft', direction: 1, label: 'Raise left outer eyebrow' },
  { region: 'Eyebrows', feature: 'browOuterUpRight', direction: 1, label: 'Raise right outer eyebrow' },
  { region: 'Eyebrows', feature: 'browInnerUp', direction: 1, label: 'Raise inner eyebrows' },
  { region: 'Eyes', feature: 'winkLeft', direction: 1, label: 'Close left eye (hold)' },
  { region: 'Eyes', feature: 'winkRight', direction: 1, label: 'Close right eye (hold)' },
  { region: 'Eyes', feature: 'eyeWideLeft', direction: 1, label: 'Widen left eye' },
  { region: 'Eyes', feature: 'eyeWideRight', direction: 1, label: 'Widen right eye' },
  { region: 'Mouth', feature: 'jawOpen', direction: 1, label: 'Open mouth' },
  { region: 'Mouth', feature: 'mouthSmileLeft', direction: 1, label: 'Raise left mouth corner' },
  { region: 'Mouth', feature: 'mouthSmileRight', direction: 1, label: 'Raise right mouth corner' },
  { region: 'Mouth', feature: 'mouthPucker', direction: 1, label: 'Purse lips' },
  { region: 'Mouth', feature: 'mouthFrownLeft', direction: 1, label: 'Lower left mouth corner' },
  { region: 'Mouth', feature: 'mouthFrownRight', direction: 1, label: 'Lower right mouth corner' },
  { region: 'Cheeks', feature: 'cheekPuff', direction: 1, label: 'Puff cheeks' },
  { region: 'Head', feature: 'headYaw', direction: 1, label: 'Turn head toward your left' },
  { region: 'Head', feature: 'headYaw', direction: -1, label: 'Turn head toward your right' },
  { region: 'Head', feature: 'headPitch', direction: 1, label: 'Tilt chin down' },
  { region: 'Head', feature: 'headPitch', direction: -1, label: 'Tilt chin up' },
  { region: 'Head', feature: 'headRoll', direction: 1, label: 'Tilt head toward your right shoulder' },
  { region: 'Head', feature: 'headRoll', direction: -1, label: 'Tilt head toward your left shoulder' },
];

export function movementLabel(feature: FeatureId, direction: 1 | -1): string {
  return MOVEMENT_OPTIONS.find((option) => option.feature === feature && option.direction === direction)?.label
    ?? `${feature} ${direction > 0 ? 'increase' : 'decrease'}`;
}

/**
 * Live signed deviation from this person's resting center, in multiples of their own
 * resting noise. A display aid for choosing a movement, not evidence of intention.
 */
export function liveDeviation(baseline: Baseline | null, frame: FeatureFrame | null, feature: FeatureId, direction: 1 | -1): number | null {
  if (!baseline || !frame || frame.tracking !== 'tracked') return null;
  const value = frame.values[feature];
  const statistics = baseline.statistics[feature];
  if (typeof value !== 'number' || !Number.isFinite(value) || !statistics) return null;
  return (direction * (value - statistics.center)) / statistics.noise;
}
