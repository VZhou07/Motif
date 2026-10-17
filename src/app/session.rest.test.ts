import { describe, expect, it } from 'vitest';
import type { FeatureId } from '../domain/types';
import { Harness, REST, type Values } from './session.test-support';
import type { SessionSnapshot } from './types';

interface Motion {
  feature: FeatureId;
  direction: 1 | -1;
  excursion: number;
  offset: number;
}

const motions: Motion[] = [
  { feature: 'browOuterUpLeft', direction: 1, excursion: 0.55, offset: 0.03 },
  { feature: 'jawOpen', direction: 1, excursion: 0.6, offset: -0.04 },
  { feature: 'headYaw', direction: 1, excursion: 12, offset: 2 },
  { feature: 'headPitch', direction: -1, excursion: -12, offset: -2 },
];

const center = (feature: FeatureId) => feature.startsWith('head') ? 0 : 0.1;
const movement = (motion: Motion): Values => ({ [motion.feature]: center(motion.feature) + motion.excursion });

/** Quiet initial rest, then small varying changes in the relaxed position, as in the reported failure. */
function start(motion: Motion): Harness {
  const h = new Harness();
  h.session.setCamera('running');
  h.session.startBaseline();
  h.run(10_500);
  const jitter = motion.feature.startsWith('head') ? 0.08 : 0.0015;
  h.noise = (t) => ({ [motion.feature]: motion.offset + jitter * Math.sin(t / 310) });
  h.session.chooseMovement({ feature: motion.feature, direction: motion.direction, label: 'My movement' });
  return h;
}

/** Human response, smooth onset and gradual relaxation; never derives a signal from fitted thresholds. */
function follow(h: Harness, motion: Motion, done: (snap: SessionSnapshot) => boolean): void {
  let prompt = h.snap.capture?.prompt;
  let since = h.now;
  let returning = false;
  const startMs = h.now;
  const cadence = [50, 83, 67, 100];
  for (let index = 0; !done(h.snap); index += 1) {
    if (h.now - startMs > 60_000) throw new Error(`Timed out in ${h.snap.stage}`);
    const current = h.snap.capture?.prompt;
    if (current !== prompt) { returning = prompt === 'Action' && current === 'Rest'; prompt = current; since = h.now; }
    const elapsed = h.now - since;
    const fraction = current === 'Action' ? Math.min(1, Math.max(0, (elapsed - 450) / 300))
      : current === 'Rest' && returning ? Math.exp(-Math.max(0, elapsed - 550) / 500) : 0;
    h.stepMs = cadence[index % cadence.length]!;
    h.step({ [motion.feature]: center(motion.feature) + motion.excursion * fraction });
  }
}

describe('calibration with a changing relaxed face (R12)', () => {
  it.each(motions)('learns $feature with later relaxed offset $offset and still verifies before controlling communication', (motion) => {
    const h = start(motion);
    follow(h, motion, (snap) => snap.stage !== 'training');
    expect(h.snap.stage, h.snap.failure?.reasons.join(' ')).toBe('verify');
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.cycles[0]!.training?.ok).toBe(true);
    expect(h.snap.candidate!.baselineCenter).toBe(center(motion.feature));
    const frozen = structuredClone(h.snap.candidate);

    follow(h, motion, (snap) => snap.stage !== 'verify');
    expect(h.snap.stage, h.snap.failure?.reasons.join(' ')).toBe('negative');
    expect(h.snap.candidate).toEqual(frozen);
    expect(h.snap.cycles[0]!.heldOut.map((attempt) => [attempt.passed, attempt.eventCount])).toEqual([[true, 1], [true, 1]]);
    const otherFeature: FeatureId = motion.feature === 'jawOpen' ? 'headRoll' : 'jawOpen';
    h.run(11_000, (t) => ({ [otherFeature]: center(otherFeature) + (otherFeature.startsWith('head') ? 3 : 0.15) * Math.sin(t / 700) ** 2 }));
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.cycles[0]!.negative).toMatchObject({ passed: true, eventCount: 0 });
    expect(h.snap.approvedModels).toEqual([]);

    h.selectByGesture('comfortable', movement(motion));
    h.selectByGesture('map:0', movement(motion));
    h.selectByGesture('approve-mapping', movement(motion));
    h.selectByGesture('finish-practice', movement(motion));
    expect(h.snap.stage).toBe('communication');
    h.run(60_000);
    expect(h.snap.message).toEqual([]);
    expect(h.snap.approvedModel).toEqual(frozen);

    h.selectByGesture('phrase:g1:0', movement(motion), 60_000, 5_000, 1_000);
    expect(h.snap.message).toEqual(['Yes']); // A long hold is still only one selection.
    h.selectByGesture('phrase:g1:0', movement(motion));
    expect(h.snap.message).toEqual(['Yes', 'Yes']);
  });

  it('still rejects a movement that remains substantially held during the return prompt', () => {
    const h = start(motions[0]!);
    h.followPrompts((snap) => snap.stage !== 'training', movement(motions[0]!));
    expect(h.snap.stage).toBe('verify');
    h.followPrompts((snap) => snap.capture?.prompt === 'Rest', movement(motions[0]!));
    h.run(5_500, movement(motions[0]!));
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.kind).toBe('verification');
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.cycles[0]!.heldOut[0]).toMatchObject({ passed: false, eventCount: 1 });
    expect(h.snap.cycles[0]!.heldOut[0]!.reasons).toContain('Return to rest after the movement.');
  });

  it('a failed held-out attempt never changes the learned model to fit the attempt', () => {
    const motion = motions[0]!;
    const h = start(motion);
    follow(h, motion, (snap) => snap.stage !== 'training');
    expect(h.snap.stage).toBe('verify');
    const learned = h.snap.candidate;
    const frozen = structuredClone(learned);
    h.followPrompts((snap) => snap.stage !== 'verify', REST);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.cycles[0]!.heldOut[0]).toMatchObject({ passed: false, eventCount: 0 });
    expect(learned).toEqual(frozen);
    expect(h.snap.candidate).toBeNull();
    expect(h.snap.diagnosticModel).toEqual(frozen);
    expect(h.snap.approvedModels).toEqual([]);
  });

  it('still refuses approval after an accidental activation in the everyday check', () => {
    const motion = motions[0]!;
    const h = start(motion);
    follow(h, motion, (snap) => snap.stage !== 'training' && snap.stage !== 'verify');
    expect(h.snap.stage).toBe('negative');
    h.run(1_000);
    h.run(1_000, movement(motion));
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.kind).toBe('negative');
    expect(h.snap.cycles[0]!.negative).toMatchObject({ passed: false, eventCount: 1 });
    expect(h.snap.approvedModels).toEqual([]);
  });
});
