import { describe, expect, it } from 'vitest';
import type { FeatureId } from '../domain/types';
import { Harness, MOUTH, REST, type Values } from './session.test-support';
import type { MovementChoice } from './types';

const MOUTH_LABEL = 'Open mouth';
const HEADS: Array<MovementChoice & { amount: number }> = [
  { feature: 'headPitch', direction: 1, label: 'Tilt down', amount: 12 },
  { feature: 'headYaw', direction: -1, label: 'Turn right', amount: -12 },
];

function mouthSetup(): Harness {
  const h = new Harness();
  h.session.setCamera('running'); h.session.startBaseline(); h.run(10_500);
  h.session.chooseMovement({ feature: 'jawOpen', direction: 1, label: MOUTH_LABEL });
  h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', MOUTH);
  expect(h.snap.stage).toBe('negative');
  h.run(11_000);
  for (const id of ['approve-comfortable', 'finish-practice']) h.selectByGesture(id, MOUTH);
  expect(h.snap.stage).toBe('communication');
  return h;
}

/** Coupled motion is below the other gesture's activation but above its release. */
function physicalMotion(label: string, head: typeof HEADS[number], amount = 1): Values {
  return label === MOUTH_LABEL
    ? { jawOpen: 0.1 + 0.6 * amount, [head.feature]: head.direction * 4 * amount }
    : { jawOpen: 0.1 + 0.2 * amount, [head.feature]: head.amount * amount };
}

/** A person prepares during Rest; they never inspect a newly changed Action label. */
function followPrepared(h: Harness, head: typeof HEADS[number]) {
  const actions: Array<{ label: string; at: number }> = [];
  let prepared = head.label;
  let active = head.label;
  let prompt = h.snap.capture?.prompt;
  let since = h.now;
  let returning = false;
  const start = h.now;
  while (h.snap.stage === 'training' || h.snap.stage === 'verify') {
    if (h.now - start > 90_000) throw new Error('Calibration did not finish');
    const capture = h.snap.capture!;
    if (capture.prompt === 'Rest' && capture.nextMovement) prepared = capture.nextMovement;
    if (capture.prompt !== prompt) {
      returning = prompt === 'Action' && capture.prompt === 'Rest';
      prompt = capture.prompt; since = h.now;
      if (prompt === 'Action') { active = prepared; actions.push({ label: active, at: h.now }); }
    }
    const elapsed = h.now - since;
    const amount = prompt === 'Action' ? Math.min(1, Math.max(0, (elapsed - 400) / 500))
      : returning ? Math.exp(-Math.max(0, elapsed - 400) / 200) : 0;
    h.step(amount ? physicalMotion(active, head, amount) : REST);
  }
  return actions;
}

describe('Open mouth plus head controls with Rest preparation (R15)', () => {
  it.each(HEADS)('$label passes the mouth cross-check and independently operates Next / Select', (head) => {
    const h = mouthSetup();
    const originalMouth = structuredClone(h.snap.approvedModel);
    h.selectByGesture('add-movement', MOUTH);
    h.session.setSpokenPrompts(true);
    h.session.chooseMovement(head);
    const actions = followPrepared(h, head);
    expect(h.snap.stage, h.snap.failure?.reasons.join(' ')).toBe('negative');
    expect(actions.map((action) => action.label)).toEqual([head.label, head.label, head.label, head.label, head.label, MOUTH_LABEL]);
    expect(actions.slice(1).map((action, index) => action.at - actions[index]!.at)).toEqual([10_000, 10_000, 10_000, 10_000, 10_000]);
    expect(h.spoken.filter((line) => line === 'Rest. Next Action: Open mouth.')).toHaveLength(1);
    expect(h.snap.cycles.at(-1)!.heldOut.map((attempt) => [attempt.kind, attempt.passed, attempt.eventCount]))
      .toEqual([['held-out', true, 1], ['held-out', true, 1], ['cross-check', true, 1]]);
    expect(h.snap.approvedModel).toEqual(originalMouth);
    h.run(11_000, (t) => ({ cheekPuff: 0.1 + 0.2 * Math.sin(t / 600) ** 2 }));
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.cycles.at(-1)!.negative).toMatchObject({ passed: true, eventCount: 0 });
    h.session.setSpokenPrompts(false);
    h.selectByGesture('approve-comfortable', MOUTH); // R18: one approve screen
    h.stepTo('finish-practice', physicalMotion(head.label, head), MOUTH);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.mapping?.mode).toBe('step');
    h.stepTo('group:g1', physicalMotion(head.label, head), MOUTH); // phrases are in groups (R18)
    h.run(800);
    const before = h.snap.scan!.index;
    h.run(800, physicalMotion(head.label, head)); h.run(800);
    expect(h.snap.scan!.index).toBe((before + 1) % h.snap.scan!.targets.length);
    expect(h.snap.message).toEqual([]);
    h.run(5_000, physicalMotion(MOUTH_LABEL, head)); h.run(800);
    expect(h.snap.message).toHaveLength(1); // A long selecting hold still acts only once.
    expect(h.snap.announcement).toBe(`Added "${h.snap.message[0]}". Back to the main list.`); // no second action on the main list
  });

  it('a genuinely colliding new movement fails without replacing the old mouth controls', () => {
    const h = mouthSetup();
    const original = structuredClone(h.snap.mapping);
    h.selectByGesture('add-movement', MOUTH);
    h.session.chooseMovement(HEADS[0]!);
    h.followPrompts((snap) => snap.stage === 'setup-failed' || snap.stage === 'negative', (snap) =>
      snap.capture?.movement === MOUTH_LABEL ? MOUTH : { jawOpen: 0.8, headPitch: 12 });
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.reasons.join(' ')).toContain('Multiple movements reached their activation thresholds together');
    expect(h.snap.mapping).toEqual(original);
    expect(h.snap.approvedModels).toHaveLength(1);
    h.selectByGesture('keep-current', MOUTH);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.approvedModel?.feature).toBe('jawOpen' satisfies FeatureId);
  });

  it('corrects the spoken target when tracking interrupts preparation for a different movement', () => {
    const h = mouthSetup();
    const head = HEADS[1]!;
    h.selectByGesture('add-movement', MOUTH);
    h.session.setSpokenPrompts(true);
    h.session.chooseMovement(head);
    h.followPrompts((snap) => snap.capture?.kind === 'verification' && snap.capture.index === 2
      && snap.capture.prompt === 'Rest' && snap.capture.nextMovement === MOUTH_LABEL,
    (snap) => physicalMotion(snap.capture?.movement ?? head.label, head));
    expect(h.spoken.at(-1)).toBe('Rest. Next Action: Open mouth.');
    expect(h.snap.cycles.at(-1)!.heldOut).toHaveLength(1);
    h.step(REST, 'missing');
    expect(h.snap.capture).toMatchObject({ index: 2, prompt: 'Rest', remainingMs: 5_000, movement: head.label, nextMovement: head.label });
    expect(h.spoken.at(-1)).toBe('Rest. Next Action: Turn right.');
    expect(h.snap.cycles.at(-1)!.heldOut).toHaveLength(1);
    const repeated = followPrepared(h, head);
    expect(repeated.map((action) => action.label)).toEqual([head.label, MOUTH_LABEL]);
    expect(h.snap.stage, h.snap.failure?.reasons.join(' ')).toBe('negative');
    expect(h.snap.cycles.at(-1)!.heldOut).toHaveLength(3);
  });
});
