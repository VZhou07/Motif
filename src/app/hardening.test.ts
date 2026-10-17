import { describe, expect, it } from 'vitest';
import { FEATURE_IDS } from '../domain/types';
import { featureNoiseFloor } from '../engine/features';
import { createLocalProfileStore, createMemoryStorage } from './profiles';
import { BROW, CHEEK, HEAD_WOBBLE, Harness, MOUTH, REST, type Values } from './session.test-support';

const BROW_LABEL = 'Raise left outer eyebrow';
const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const PUFF_CHEEKS = { feature: 'cheekPuff', direction: 1, label: 'Puff cheeks' } as const;
const MOVES: Record<string, Values> = { [BROW_LABEL]: BROW, 'Open mouth': MOUTH, 'Puff cheeks': CHEEK };
const perform = (label: string | null): Values => MOVES[label ?? ''] ?? REST;

/** Fixed-seed linear congruential generator in [-1, 1): deterministic "noise". */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0; return (state / 2 ** 32) * 2 - 1; };
}
/** Uniform jitter on every feature: `coefficient` and `degrees` amplitudes in absolute units. */
function jitter(seed: number, coefficient: number, degrees: number): (t: number) => Values {
  const next = lcg(seed);
  return () => Object.fromEntries(FEATURE_IDS.map((id) => [id, next() * (id.startsWith('head') ? degrees : coefficient)])) as Values;
}

const used = (h: Harness, label = BROW_LABEL) => h.snap.evidence.find((item) => item.label === label)?.use.completed ?? 0;

describe('demo: Person A and Person B without code changes (R10)', () => {
  it('two people with different movements save, restore and communicate; plus fallback and zero gestures', () => {
    const storage = createMemoryStorage();
    const store = () => createLocalProfileStore(() => storage);

    // Person A: one eyebrow movement, automatic scanning.
    const a = new Harness({ profiles: store() });
    a.setUpToCommunication();
    expect(a.session.saveProfile('Person A')).toEqual({ ok: true });

    // Person B: mouth selects, cheek puff moves next; an edited phrase.
    const b = new Harness({ profiles: store() });
    b.session.editVocabulary({ kind: 'edit-phrase', group: 'g1', index: 1, text: 'Coffee please' });
    b.session.setCamera('running');
    b.session.startBaseline();
    b.run(10_500);
    b.session.chooseMovement(OPEN_MOUTH);
    b.followPrompts((snap) => snap.stage === 'negative', MOUTH);
    b.run(11_000, HEAD_WOBBLE);
    b.selectByGesture('comfortable', MOUTH);
    b.selectByGesture('map:0', MOUTH);
    b.selectByGesture('approve-mapping', MOUTH);
    b.selectByGesture('finish-practice', MOUTH);
    b.selectByGesture('add-movement', MOUTH);
    b.session.chooseMovement(PUFF_CHEEKS);
    b.followPrompts((snap) => snap.stage === 'negative', (snap) => perform(snap.capture?.movement ?? null));
    b.run(11_000, HEAD_WOBBLE);
    b.selectByGesture('comfortable', MOUTH);
    b.selectByGesture('map:0', MOUTH);
    b.selectByGesture('approve-mapping', MOUTH);
    expect(b.snap.mappingLabel).toBe('Open mouth selects · Puff cheeks moves next (step by step, no timer)');
    expect(b.session.saveProfile('Person B')).toEqual({ ok: true });

    // Later, Person A on the same computer: restore stays unarmed until the re-check is approved.
    const laterA = new Harness({ profiles: store() });
    laterA.session.setCamera('running');
    laterA.session.restoreProfile('Person A');
    laterA.run(10_500);
    expect(laterA.snap.approvedModels).toEqual([]);
    laterA.followPrompts((snap) => snap.stage === 'negative', BROW);
    laterA.run(11_000, HEAD_WOBBLE);
    laterA.selectByGesture('comfortable');
    laterA.selectByGesture('approve-mapping');
    laterA.selectByGesture('finish-practice');
    laterA.run(1_000);
    laterA.run(800, MOUTH); laterA.run(800);
    laterA.run(800, CHEEK); laterA.run(800); // Person B's movements do nothing here
    expect(laterA.snap.message).toEqual([]);
    laterA.selectByGesture('phrase:g2:0');
    laterA.selectByGesture('speak');
    expect(laterA.spoken).toEqual(['I need water']);

    // Person B restores their own setup: steps with cheek, selects with mouth; A's brow does nothing.
    const laterB = new Harness({ profiles: store() });
    laterB.session.setCamera('running');
    laterB.session.restoreProfile('Person B');
    laterB.run(10_500);
    laterB.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    laterB.run(11_000, HEAD_WOBBLE);
    expect(laterB.snap.stage).toBe('comfort');
    laterB.selectByGesture('comfortable', MOUTH);
    laterB.selectByGesture('approve-mapping', MOUTH);
    laterB.stepTo('finish-practice', CHEEK, MOUTH);
    laterB.run(600, BROW); laterB.run(600);
    expect(laterB.snap.message).toEqual([]);
    laterB.stepTo('phrase:g1:1', CHEEK, MOUTH);
    expect(laterB.snap.message).toEqual(['Coffee please']);
    laterB.stepTo('speak', CHEEK, MOUTH);
    expect(laterB.spoken).toEqual(['Coffee please']);

    // One-movement fallback: Person B approves the mouth alone with automatic scanning.
    laterB.stepTo('change-controls', CHEEK, MOUTH);
    const mouthOnly = laterB.snap.decisions.find((decision) => decision.label.includes('Open mouth selects (automatic scanning)'))!;
    laterB.selectByGesture(mouthOnly.id, MOUTH);
    laterB.selectByGesture('approve-mapping', MOUTH);
    laterB.selectByGesture('finish-practice', MOUTH);
    expect(laterB.snap.scanMode).toBe('auto');
    laterB.selectByGesture('phrase:g1:0', MOUTH);
    expect(laterB.snap.message).toEqual(['Coffee please', 'Yes']);

    // Zero gestures: assisted Space only.
    const helper = new Harness({ profiles: store() });
    helper.session.useAssisted();
    helper.switchTo('phrase:g1:0');
    expect(helper.snap.message).toEqual(['Yes']);
  });
});

describe('noise, lighting and flicker (R10)', () => {
  it.each([['light', 4 * featureNoiseFloor('jawOpen'), 4 * featureNoiseFloor('headYaw')], ['medium', 0.03, 1.5]])(
    '%s jitter: calibrates, a minute of rest selects nothing, and each hold selects once', (_name, coefficient, degrees) => {
      const h = new Harness();
      h.noise = jitter(7, coefficient, degrees);
      h.setUpToCommunication();
      expect(h.snap.stage).toBe('communication');
      const before = used(h);
      h.run(60_000);
      expect(h.snap.message).toEqual([]);
      expect(used(h)).toBe(before);
      for (let i = 0; i < 3; i += 1) h.selectByGesture('phrase:g1:0');
      expect(h.snap.message).toEqual(['Yes', 'Yes', 'Yes']);
      expect(used(h)).toBe(before + 6); // each phrase is two holds now: open Quick, then Yes (R14)
    });

  it('heavy jitter on the chosen feature is rejected as overlapping rest', () => {
    const next = lcg(11);
    const h = new Harness();
    // Slow (400 ms) wander of ±0.25 that smoothing cannot remove, kept inside the real coefficient range.
    let held = 0;
    let until = 0;
    h.noise = (t) => {
      if (t >= until) { held = Math.max(-0.1, next() * 0.25); until = t + 400; }
      return { browOuterUpLeft: held };
    };
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    expect(h.snap.stage).toBe('choose');
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: BROW_LABEL });
    h.followPrompts((snap) => snap.stage !== 'training', { browOuterUpLeft: 0.35 }); // a small movement inside the wander
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.reasons.join(' ')).toMatch(/overlaps resting variation/);
    expect(h.snap.approvedModels).toEqual([]);
  });

  it('a lighting shift after calibration is not adapted to: below release nothing, above activation at most one action', () => {
    const h = new Harness();
    h.setUpToCommunication();
    const model = h.snap.approvedModels[0]!;
    const before = used(h);
    h.noise = () => ({ browOuterUpLeft: model.releaseThreshold * 0.5 });
    h.run(60_000);
    expect(used(h)).toBe(before);
    expect(h.snap.message).toEqual([]);
    h.noise = () => ({ browOuterUpLeft: model.activationThreshold + 0.05 });
    h.run(20_000);
    expect(used(h) - before).toBe(1); // one action for the whole shifted period, never repeated
    h.noise = null;
    h.selectByGesture('phrase:g2:1');
    expect(h.snap.message.at(-1)).toBe('Please help me');
  });

  it('flickering tracking never acts, even with a movement held; stable tracking then selects once', () => {
    const h = new Harness();
    h.setUpToCommunication();
    const before = used(h);
    const gaps = ['missing', 'multiple', 'stale'] as const;
    for (let burst = 0; burst < 50; burst += 1) {
      for (let i = 0; i < 4; i += 1) h.step(BROW, gaps[burst % gaps.length]);
      h.run(400, BROW); // after each gap: shorter than 350 ms rearm + 250 ms dwell
    }
    expect(used(h)).toBe(before);
    expect(h.snap.message).toEqual([]);
    // Movements that start inside each short burst: still no time to rest, arm and dwell.
    for (let burst = 0; burst < 30; burst += 1) {
      for (let i = 0; i < 4; i += 1) h.step(REST, gaps[burst % gaps.length]);
      h.run(50);
      h.run(350, BROW);
    }
    expect(used(h)).toBe(before);
    h.run(1_000);
    h.run(800, BROW);
    h.run(1_200);
    expect(used(h)).toBe(before + 1);
  });
});
