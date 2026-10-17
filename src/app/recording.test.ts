import { expect, it } from 'vitest';
import { FEATURE_IDS, type TrainingTrial } from '../domain/types';
import { Harness } from './session.test-support';

it('keeps the shared neutral frames identical in the session recorder', () => {
  const h = new Harness();
  h.session.setCamera('running'); h.session.startBaseline(); h.run(10_500);
  h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
  h.followPrompts((snapshot) => snapshot.stage !== 'training');
  const trials = (h.session as unknown as { trials: TrainingTrial[] }).trials;
  const metadata = trials.map((trial) => [trial.restBefore.length, trial.restAfter.length,
    trial.restBefore[0]!.timestampMs, trial.movement[0]!.timestampMs, trial.restAfter.at(-1)!.timestampMs]);
  for (let index = 1; index < trials.length; index += 1) {
    const before = trials[index]!.restBefore;
    const previous = trials[index - 1]!.restAfter;
    expect(before, JSON.stringify(metadata)).toEqual(previous);
    expect(before.every((frame, j) => frame.timestampMs === previous[j]!.timestampMs
      && FEATURE_IDS.every((id) => frame.values[id] === previous[j]!.values[id]))).toBe(true);
  }
  expect(h.snap.stage, JSON.stringify(metadata) + h.snap.failure?.reasons.join(' ')).toBe('verify');
});
