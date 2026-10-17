import { describe, expect, it, vi } from 'vitest';
import { BROW, Harness, REST, type Values } from './session.test-support';
import type { SessionSnapshot } from './types';

function training(spoken = false): Harness {
  const h = new Harness();
  h.session.setSpokenPrompts(spoken);
  h.session.setCamera('running');
  h.session.startBaseline();
  h.run(10_500);
  h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
  return h;
}

/** Simulated person: respond to the displayed cue, independently of recorder durations. */
function followWithJitter(h: Harness, done: (snap: SessionSnapshot) => boolean, movement: Values, delayMs: number): void {
  const start = h.now;
  let prompt = h.snap.capture?.prompt;
  let since = h.now;
  let returning = false;
  const cadence = [43, 89, 71, 57];
  for (let index = 0; !done(h.snap); index += 1) {
    if (h.now - start > 65_000) throw new Error(`Timed out in ${h.snap.stage}: ${h.snap.failure?.reasons.join(', ')}`);
    const current = h.snap.capture?.prompt;
    if (current !== prompt) { returning = prompt === 'Action' && current === 'Rest'; prompt = current; since = h.now; }
    const elapsed = h.now - since;
    const moving = (current === 'Action' && elapsed >= delayMs) || (current === 'Rest' && returning && elapsed < delayMs);
    h.stepMs = cadence[index % cadence.length]!;
    h.step(moving ? movement : REST);
  }
}

describe('natural guided pacing (R11)', () => {
  it('speaks each real phase once across all five attempts, ending directly with everyday activity', () => {
    const h = training(true);
    expect(h.spoken).toEqual(['Rest']);
    h.followPrompts((snap) => snap.stage === 'negative');
    expect(h.spoken).toEqual(['Rest', ...Array.from({ length: 5 }, () => ['Action', 'Rest']).flat(), 'Everyday activity']);
    expect(h.snap.capture?.prompt).toBe('Everyday activity');
    expect(h.snap.capture?.remainingMs).toBe(10_000);
  });

  it('immediately cancels an interrupted Move and restarts the matching ready countdown without counting the trial', () => {
    const h = training(true);
    const cancel = vi.spyOn(h.speech, 'cancel');
    h.followPrompts((snap) => snap.capture?.prompt === 'Action');
    h.run(450, BROW);
    h.step(REST, 'missing');
    expect(cancel).toHaveBeenCalledOnce();
    expect(h.spoken.at(-1)).toBe('Rest');
    expect(h.snap.capture).toMatchObject({ prompt: 'Rest', remainingMs: 5_000, index: 1, validMs: 0, interruptions: 1 });
    h.step();
    expect(h.snap.capture?.remainingMs).toBe(5_000);
    h.followPrompts((snap) => snap.stage === 'negative');
    expect(h.snap.cycles[0]!.training?.ok).toBe(true);
    expect(h.snap.cycles[0]!.heldOut).toHaveLength(2);
  });

  it('cancels stale speech without starting another ready cue when interruptions fail setup', () => {
    const h = training(true);
    const cancel = vi.spyOn(h.speech, 'cancel');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      h.followPrompts((snap) => snap.capture?.prompt === 'Action');
      const before = h.spoken.length;
      h.step(REST, 'missing');
      expect(h.spoken.slice(before)).toEqual(attempt < 4 ? ['Rest'] : []);
    }
    expect(cancel.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.capture).toBeNull();
  });

  it('does not progress or complete when the camera stops supplying frames', () => {
    const h = training();
    h.run(1_000);
    h.stall(12_000);
    expect(h.snap.stage).toBe('training');
    expect(h.snap.capture).toMatchObject({ index: 1, prompt: 'Rest', remainingMs: 5_000, validMs: 0 });
    expect(h.snap.cycles[0]!.training).toBeNull();
  });

  it.each([700, 950])('preserves fitting and frozen verification with %i ms onset/release delays and jitter in both directions', (delayMs) => {
    for (const direction of [1, -1] as const) {
      const h = new Harness();
      h.session.setCamera('running');
      h.session.startBaseline();
      h.run(10_500);
      h.session.chooseMovement({ feature: 'headYaw', direction, label: 'Comfortable head turn' });
      const movement = { headYaw: direction * 12 };
      followWithJitter(h, (snap) => snap.stage !== 'training', movement, delayMs);
      expect(h.snap.stage, h.snap.failure?.reasons.join(', ')).toBe('verify');
      const frozen = structuredClone(h.snap.candidate);
      followWithJitter(h, (snap) => snap.stage !== 'verify', movement, delayMs);
      expect(h.snap.stage, h.snap.failure?.reasons.join(', ')).toBe('negative');
      expect(h.snap.candidate).toEqual(frozen);
      expect(h.snap.cycles[0]!.heldOut.map((attempt) => [attempt.passed, attempt.eventCount])).toEqual([[true, 1], [true, 1]]);
      h.run(11_000);
      expect(h.snap.stage).toBe('comfort');
      expect(h.snap.cycles[0]!.negative).toMatchObject({ passed: true, eventCount: 0 });
      expect(h.snap.approvedModel).toBeNull();
    }
  });

  it.each(['early', 'brief'] as const)('rejects %s-only movement instead of treating the longer lead-in as usable evidence', (kind) => {
    const h = training(true);
    let prompt = h.snap.capture?.prompt;
    let since = h.now;
    const start = h.now;
    while (h.snap.stage === 'training') {
      if (h.now - start > 45_000) throw new Error('Training did not finish');
      const current = h.snap.capture?.prompt;
      if (current !== prompt) { prompt = current; since = h.now; }
      const elapsed = h.now - since;
      const moving = kind === 'early' ? current === 'Rest' && elapsed < 500 : current === 'Action' && elapsed < 500;
      h.step(moving ? BROW : REST);
    }
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.kind).toBe('training');
    expect(h.snap.candidate).toBeNull();
    expect(h.spoken).toEqual(['Rest', ...Array.from({ length: 3 }, () => ['Action', 'Rest']).flat()]);
  });
});
