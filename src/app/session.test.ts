import { describe, expect, it } from 'vitest';
import { BROW, CHEEK, HEAD_WOBBLE, Harness, MOUTH, PUCKER, REST, type Values } from './session.test-support';
import type { MovementChoice } from './types';

describe('guided calibration to communication (simulated numeric person)', () => {
  it('learns, verifies, approves by gesture, practices, composes and speaks', () => {
    const h = new Harness();
    h.calibrate();
    const cycle = h.snap.cycles[0]!;
    expect(h.snap.stage).toBe('comfort');
    expect(cycle.training).toEqual({ ok: true, reasons: [] });
    expect(cycle.heldOut.map((attempt) => [attempt.passed, attempt.eventCount])).toEqual([[true, 1], [true, 1]]);
    expect(cycle.negative?.passed).toBe(true);
    expect(cycle.negative?.eventCount).toBe(0);
    expect(cycle.negative?.validDurationMs).toBeGreaterThanOrEqual(10_000);
    expect(h.snap.approvedModel).toBeNull();
    expect(h.snap.scan?.driver).toBe('gesture');

    // First movement: one approve screen replaces the separate comfort, mapping and confirm screens (UX slice 2).
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['record-again', 'approve-comfortable', 'approve-effort', 'another-movement']);
    expect(h.snap.mapping).toBeNull();
    h.selectByGesture('approve-comfortable');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModel?.feature).toBe('browOuterUpLeft');
    expect(h.snap.mapping?.mode).toBe('auto');
    expect(h.snap.cycles[0]!.outcome).toBe('approved');

    h.selectByGesture('phrase:0');
    expect(h.snap.practice).toEqual({ selections: 1, last: 'Yes' });
    expect(h.snap.message).toEqual([]);
    expect(h.spoken).toEqual([]);
    h.selectByGesture('finish-practice');
    expect(h.snap.stage).toBe('communication');

    h.selectByGesture('phrase:2');
    expect(h.snap.message).toEqual(['I need water']);
    h.selectByGesture('speak');
    expect(h.spoken).toEqual(['I need water']);
    expect(h.snap.lastSpoken).toBe('I need water');
  });

  it('never offers communication or approval before verification', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
    h.session.decide('approve-mapping');
    h.session.chooseSetupTarget('map:0');
    h.session.selectTarget('phrase:0');
    h.session.switchPress();
    expect(h.snap.stage).toBe('training');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.approvedModel).toBeNull();
    expect(h.snap.scan).toBeNull();
  });

  it('requires the camera before the rest check', () => {
    const h = new Harness();
    h.session.startBaseline();
    expect(h.snap.stage).toBe('welcome');
    expect(h.snap.announcement).toMatch(/camera/i);
  });

  it('restarts an interrupted rest check and never fits across the gap', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(6_000);
    h.step(REST, 'missing');
    expect(h.snap.capture?.interruptions).toBe(1);
    expect(h.snap.capture?.validMs).toBe(0);
    h.run(6_000);
    expect(h.snap.stage).toBe('baseline');
    h.run(4_500);
    expect(h.snap.stage).toBe('choose');
    expect(h.snap.baseline?.durationMs).toBeGreaterThanOrEqual(10_000);
  });

  it('redoes a training attempt interrupted by tracking loss instead of counting it', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
    h.followPrompts((snap) => snap.capture?.prompt === 'Action');
    h.run(500, BROW);
    h.step(REST, 'multiple');
    expect(h.snap.stage).toBe('training');
    expect(h.snap.capture?.index).toBe(1);
    expect(h.snap.capture?.interruptions).toBe(1);
    expect(h.snap.capture?.prompt).toBe('Rest');
    h.followPrompts((snap) => snap.stage === 'verify');
    expect(h.snap.cycles[0]!.training?.ok).toBe(true);
  });

  it('fails a held-out attempt without a movement and requires a full new training cycle', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
    h.followPrompts((snap) => snap.stage === 'verify');
    h.followPrompts((snap) => snap.stage !== 'verify', REST);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.kind).toBe('verification');
    expect(h.snap.cycles[0]!.heldOut[0]).toMatchObject({ passed: false, eventCount: 0 });
    expect(h.snap.cycles[0]!.outcome).toBe('failed');
    expect(h.snap.candidate).toBeNull();
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['record-again', 'another-movement']);
    h.session.decide('record-again');
    expect(h.snap.stage).toBe('training');
    expect(h.snap.capture?.index).toBe(1);
    expect(h.snap.cycles).toHaveLength(2);
    expect(h.snap.cycles[0]!.heldOut).toHaveLength(1);
  });

  it('rejects a movement that does not separate from rest', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
    h.followPrompts((snap) => snap.stage !== 'training', { browOuterUpLeft: 0.1015 });
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.kind).toBe('training');
    expect(h.snap.cycles[0]!.training?.ok).toBe(false);
  });

  it('fails the negative window on an accidental activation and reports the count', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
    h.followPrompts((snap) => snap.stage === 'negative');
    h.run(3_000);
    h.run(700, BROW);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.kind).toBe('negative');
    expect(h.snap.cycles[0]!.negative).toMatchObject({ passed: false, eventCount: 1 });
  });

  it('restarts the negative window after a near-miss and only passes on the evaluator', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
    h.followPrompts((snap) => snap.stage === 'negative');
    h.run(4_000);
    h.run(150, BROW);
    h.run(500);
    expect(h.snap.stage).toBe('negative');
    expect(h.snap.capture?.interruptions).toBe(1);
    expect(h.snap.capture?.validMs).toBeLessThan(1_000);
    h.run(10_500);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.cycles[0]!.negative).toMatchObject({ passed: true, restarts: 1, eventCount: 0 });
  });
});


describe('communication safety', () => {
  function ready(): Harness {
    const h = new Harness();
    h.setUpToCommunication();
    expect(h.snap.stage).toBe('communication');
    return h;
  }

  it('discards a dwell interrupted by tracking loss and needs fresh neutral after recovery', () => {
    const h = ready();
    h.run(500);
    h.run(150, BROW);
    expect(h.snap.scan?.latched).not.toBeNull();
    h.step(REST, 'missing');
    expect(h.snap.scan?.latched).toBeNull();
    expect(h.snap.scan?.suspended).toBe(true);
    h.run(400, BROW);
    expect(h.snap.message).toEqual([]);
    expect(h.snap.scan?.suspended).toBe(false);
    expect(h.snap.runtime?.armed).toBe(false);
  });

  it('suspends on a hidden tab and never applies a delayed or catch-up selection', () => {
    const h = ready();
    h.run(500);
    const index = h.snap.scan!.index;
    h.run(150, BROW);
    h.session.setHidden(true, h.now);
    h.run(10_000, BROW);
    expect(h.snap.message).toEqual([]);
    expect(h.snap.scan?.index).toBe(index);
    h.session.setHidden(false, h.now);
    h.run(300, BROW);
    expect(h.snap.message).toEqual([]);
  });

  it('stalled input trips the watchdog without new frames', () => {
    const h = ready();
    h.run(500);
    h.run(150, BROW);
    h.stall(400);
    expect(h.snap.scan?.suspended).toBe(true);
    expect(h.snap.scan?.latched).toBeNull();
    expect(h.snap.runtime?.armed).toBe(false);
    expect(h.snap.message).toEqual([]);
  });

  it('selects the target latched at dwell onset even when the dwell spans a scan boundary', () => {
    const h = ready();
    let since = h.now;
    let index = h.snap.scan!.index;
    while (!(h.highlightedId() === 'phrase:1' && h.now - since >= 1_850 && h.snap.runtime?.armed)) {
      h.step(REST);
      if (h.snap.scan!.index !== index) { index = h.snap.scan!.index; since = h.now; }
    }
    h.run(600, BROW);
    h.run(600);
    expect(h.snap.message).toEqual(['No']);
    expect(h.highlightedId()).toBe('speak'); // the list changed, so the highlight restarts at its first item
  });

  it('emits once per hold and rearms only after full neutral', () => {
    const h = ready();
    h.selectByGesture('phrase:0', BROW, 60_000, 8_000, 0);
    expect(h.snap.message).toEqual(['Yes']);
    h.run(600, { browOuterUpLeft: 0.3 });
    h.run(600, BROW);
    expect(h.snap.message).toEqual(['Yes']);
    h.run(600);
    h.run(600, BROW);
    expect(h.snap.message).toHaveLength(2);
  });

  it('pauses by gesture, resumes by gesture after neutral, and never selects while paused', () => {
    const h = ready();
    h.selectByGesture('pause');
    expect(h.snap.scan?.paused).toBe(true);
    const index = h.snap.scan!.index;
    h.run(6_000);
    expect(h.snap.scan?.index).toBe(index);
    h.session.selectTarget('phrase:0');
    h.run(500);
    h.run(600, BROW);
    h.run(600);
    expect(h.snap.scan?.paused).toBe(false);
    expect(h.snap.message).toEqual([]);
  });

  it('changes scan speed by gesture within bounds', () => {
    const h = ready();
    h.selectByGesture('slower');
    expect(h.snap.scan?.intervalMs).toBe(2_500);
  });

  it('keeps the current setup from recalibration and requires fresh neutral', () => {
    const h = ready();
    const model = h.snap.approvedModel;
    h.selectByGesture('recalibrate');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.scan?.targets.map((target) => target.id)).toEqual(['recalibrate-no', 'recalibrate-yes']);
    h.selectByGesture('recalibrate-no', BROW, 60_000, 3_000, 0);
    expect(h.snap.confirmingRecalibrate).toBe(false);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.approvedModel).toEqual(model);
    expect(h.snap.runtime?.armed).toBe(false);
    expect(h.snap.message).toEqual([]);
    h.run(600);
    expect(h.snap.runtime?.armed).toBe(true);
  });

  it('recalibration cancel discards new capture and returns only through Keep current setup', () => {
    const h = ready();
    const model = h.snap.approvedModel;
    h.selectByGesture('recalibrate');
    h.selectByGesture('recalibrate-yes');
    expect(h.snap.stage).toBe('baseline');
    expect(h.snap.recalibrating).toBe(true);
    h.run(3_000, BROW);
    expect(h.snap.message).toEqual([]);
    h.session.cancel();
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['restart-recalibration', 'another-movement', 'keep-current']);
    expect(h.snap.scan?.driver).toBe('gesture');
    h.selectByGesture('keep-current');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.approvedModel).toEqual(model);
    expect(h.snap.recalibrating).toBe(false);
  });

  it('a new recalibrated movement replaces the old one only after approval', () => {
    const h = ready();
    const old = h.snap.approvedModel!;
    h.selectByGesture('recalibrate');
    h.selectByGesture('recalibrate-yes');
    h.run(10_500);
    expect(h.snap.stage).toBe('choose');
    h.selectByGesture('same-movement');
    h.followPrompts((snap) => snap.stage === 'negative');
    h.run(11_000);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.approvedModel).toEqual(old);
    h.selectByGesture('approve-comfortable');
    expect(h.snap.approvedModel?.id).not.toBe(old.id);
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(h.snap.cycles.at(-1)?.outcome).toBe('approved');
  });

  it('ignores setup decisions that are not currently offered', () => {
    const h = ready();
    h.session.decide('approve-mapping');
    h.session.chooseSetupTarget('map:0');
    h.session.decide('approve-saved');
    expect(h.snap.stage).toBe('communication');
  });

  it('keeps text visible and explains when no local voice is available', () => {
    const h = ready();
    h.speechAvailable = false;
    h.selectByGesture('phrase:3');
    h.selectByGesture('speak');
    expect(h.spoken).toEqual([]);
    expect(h.snap.lastSpoken).toBe('Please help me');
    expect(h.snap.announcement).toMatch(/not available/);
  });
});

describe('assisted input (clearly labeled zero-gesture path)', () => {
  it('Space selects the highlighted target; camera frames cannot act', () => {
    const h = new Harness();
    h.session.useAssisted();
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.scan?.driver).toBe('assisted');
    h.session.switchPress(h.now);
    expect(h.snap.message).toEqual(['Yes']);
    h.session.setCamera('running');
    h.run(5_000, (t) => (t % 2_000 < 1_000 ? BROW : REST));
    expect(h.snap.message).toEqual(['Yes']);
    expect(h.snap.approvedModel).toBeNull();
    expect(h.snap.cycles).toEqual([]);
  });

  it('Space pauses and resumes without selecting, and does nothing in gesture mode', () => {
    const h = new Harness();
    h.session.useAssisted();
    for (let i = 0; i < 6; i += 1) h.stall(2_000);
    expect(h.highlightedId()).toBe('pause');
    h.session.switchPress(h.now);
    expect(h.snap.scan?.paused).toBe(true);
    h.session.switchPress(h.now);
    expect(h.snap.scan?.paused).toBe(false);
    expect(h.snap.message).toEqual([]);
    const gesture = new Harness();
    gesture.setUpToCommunication();
    gesture.session.switchPress(gesture.now);
    expect(gesture.snap.message).toEqual([]);
  });
});

describe('honest limits and setup settings', () => {
  it('edits phrases only during setup, validates input, and uses the edit everywhere', () => {
    const h = new Harness();
    expect(h.session.setPhrase(0, '  Hello there  ')).toBe(true);
    for (const [index, text] of [[-1, 'x'], [6, 'x'], [1.5, 'x'], [1, '   '], [1, 'x'.repeat(61)]] as const) {
      expect(h.session.setPhrase(index, text)).toBe(false);
    }
    expect(h.snap.phrases).toEqual(['Hello there', 'No', 'I need water', 'Please help me', 'I am uncomfortable', 'Thank you']);
    h.session.useAssisted();
    expect(h.session.setPhrase(1, 'Changed during use')).toBe(false);
    expect(h.snap.scan?.targets[0]?.label).toBe('Hello there');
    h.session.switchPress(h.now);
    expect(h.snap.message).toEqual(['Hello there']);
  });

  it('fails the rest check honestly on the fifth tracking interruption', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    for (let i = 0; i < 4; i += 1) { h.run(1_000); h.step(REST, 'missing'); }
    expect(h.snap.stage).toBe('baseline');
    expect(h.snap.capture?.interruptions).toBe(4);
    h.run(1_000);
    h.step(REST, 'missing');
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure).toMatchObject({ kind: 'baseline', title: 'Tracking was interrupted too often' });
    expect(h.snap.baseline).toBeNull();
  });

  it('ends a negative window that cannot stay armed for ten seconds within one minute', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
    h.followPrompts((snap) => snap.stage === 'negative');
    while (h.snap.stage === 'negative') {
      if (h.now > 200_000) throw new Error('negative cap never triggered');
      h.run(4_850);
      h.run(150, BROW);
    }
    expect(h.snap.failure?.kind).toBe('negative');
    const negative = h.snap.cycles[0]!.negative!;
    expect(negative.passed).toBe(false);
    expect(negative.eventCount).toBe(0);
    expect(negative.restarts).toBeGreaterThanOrEqual(10);
    expect(negative.validDurationMs).toBeLessThan(10_000);
    expect(negative.reasons).toContain('Ten seconds of everyday activity were not recorded within one minute.');
  });

  it('speaks capture prompts only when the helper enables spoken prompts', () => {
    for (const enabled of [true, false]) {
      const h = new Harness();
      h.session.setSpokenPrompts(enabled);
      h.session.setCamera('running');
      h.session.startBaseline();
      h.run(10_500);
      h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
      h.followPrompts((snap) => snap.capture?.index === 2);
      expect(h.spoken.slice(0, 3)).toEqual(enabled ? ['Rest', 'Action', 'Rest'] : []);
    }
  });
});

const BROW_LABEL = 'Raise left outer eyebrow';
const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const PUCKER_LIPS = { feature: 'mouthPucker', direction: 1, label: 'Pucker lips' } as const;
const PUFF_CHEEKS = { feature: 'cheekPuff', direction: 1, label: 'Puff cheeks' } as const;
const MOVES: Record<string, Values> = { [BROW_LABEL]: BROW, 'Open mouth': MOUTH, 'Pucker lips': PUCKER, 'Puff cheeks': CHEEK };
const perform = (label: string | null): Values => MOVES[label ?? ''] ?? REST;

/** From communication: add a verified movement, confirm comfort and approve proposal `proposal` by gesture. */
function addAndApprove(h: Harness, choice: MovementChoice, proposal = 'map:0'): void {
  h.addMovement(choice, perform);
  expect(h.snap.stage).toBe('comfort');
  if (proposal === 'map:0') h.selectByGesture('approve-comfortable');
  else { h.selectByGesture('choose-different'); h.selectByGesture(proposal); h.selectByGesture('approve-mapping'); }
  expect(h.snap.stage).toBe('practice');
}

/** Brow selects, mouth moves next (step scanning), in communication. */
function twoGestureStep(): Harness {
  const h = new Harness();
  h.setUpToCommunication();
  addAndApprove(h, OPEN_MOUTH);
  h.stepTo('finish-practice');
  expect(h.snap.stage).toBe('communication');
  return h;
}

describe('multiple gestures (R6)', () => {
  it('adds a second movement with held-out, cross-check and negative evidence over the whole set', () => {
    const h = new Harness();
    h.setUpToCommunication();
    h.session.selectTarget('helper');
    expect(h.snap.scan?.targets.map((target) => target.id)).toContain('add-movement');
    h.session.selectTarget('close-helper');
    h.addMovement(OPEN_MOUTH, perform);
    expect(h.snap.stage).toBe('comfort');
    const cycle = h.snap.cycles[1]!;
    expect(cycle.movement).toBe('Open mouth');
    expect(cycle.heldOut.map((attempt) => [attempt.kind, attempt.expected, attempt.passed, attempt.eventCount])).toEqual([
      ['held-out', 'Open mouth', true, 1], ['held-out', 'Open mouth', true, 1], ['cross-check', BROW_LABEL, true, 1],
    ]);
    expect(cycle.negative).toMatchObject({ passed: true, eventCount: 0 });
    expect(cycle.negative!.validDurationMs).toBeGreaterThanOrEqual(10_000);
    // Nothing changes until the new set's controls are approved.
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(h.snap.mapping?.mode).toBe('auto');

    h.selectByGesture('choose-different');
    expect(h.snap.stage).toBe('mapping');
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['keep-current', 'map:0', 'map:1', 'map:2', 'map:3', 'reject']);
    h.selectByGesture('map:0');
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.approvedModels).toHaveLength(1);
    h.selectByGesture('approve-mapping');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels.map((model) => model.label)).toEqual([BROW_LABEL, 'Open mouth']);
    expect(h.snap.mapping?.mode).toBe('step');
    expect(h.snap.scanMode).toBe('step');
    expect(h.snap.cycles[1]!.outcome).toBe('approved');
  });

  it('fails a candidate that interferes with an existing movement and keeps the old set after fresh neutral', () => {
    const h = new Harness();
    h.setUpToCommunication();
    const before = h.snap.mapping;
    // The person's brow raise also lifts the inner brows, so the new inner-brow model collides with it.
    const habit = (label: string | null): Values => (label === BROW_LABEL ? { ...BROW, browInnerUp: 0.7 } : { browInnerUp: 0.7 });
    h.addMovement({ feature: 'browInnerUp', direction: 1, label: 'Raise inner brows' }, habit);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.title).toMatch(/interfered with “Raise left outer eyebrow”/);
    const attempts = h.snap.cycles[1]!.heldOut;
    expect(attempts.map((attempt) => [attempt.kind, attempt.passed])).toEqual([['held-out', true], ['held-out', true], ['cross-check', false]]);
    expect(h.snap.cycles[1]!.negative).toBeNull();
    expect(h.snap.decisions.map((decision) => decision.id)).toContain('keep-current');

    h.selectByGesture('keep-current', BROW, 60_000, 600, 0);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.runtime?.armed).toBe(false); // the selecting hold cannot carry over
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(h.snap.mapping).toEqual(before);
    expect(h.snap.adding).toBe(false);
    h.selectByGesture('phrase:1');
    expect(h.snap.message).toEqual(['No']);
  });

  it('refuses a movement that is already a control but allows the opposite direction', () => {
    const h = new Harness();
    h.setUpToCommunication();
    h.selectByGesture('add-movement');
    expect(h.snap.stage).toBe('choose');
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['discover', 'keep-current']);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Raise left outer eyebrow again' });
    expect(h.snap.stage).toBe('choose');
    expect(h.snap.announcement).toMatch(/already one of your controls/);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: -1, label: 'Lower left outer eyebrow' });
    expect(h.snap.stage).toBe('training');
  });

  it('a simultaneous brow and mouth movement selects nothing in setup or communication', () => {
    const h = new Harness();
    h.setUpToCommunication();
    h.addMovement(OPEN_MOUTH, perform);
    expect(h.snap.stage).toBe('comfort');
    h.run(1_000);
    h.run(800, { ...BROW, ...MOUTH });
    h.run(800);
    expect(h.snap.stage).toBe('comfort');
    h.selectByGesture('approve-comfortable');
    h.stepTo('finish-practice');
    expect(h.snap.stage).toBe('communication');
    const index = h.snap.scan!.index;
    h.run(800);
    h.run(800, { ...BROW, ...MOUTH });
    h.run(800);
    expect(h.snap.scan!.index).toBe(index);
    expect(h.snap.message).toEqual([]);
    expect(h.snap.stage).toBe('communication');
  });

  it('step scanning has no timed advance, next never latches, and select picks the stepped item', () => {
    const h = twoGestureStep();
    expect(h.snap.scan?.targets.map((target) => target.id)).not.toContain('slower');
    const index = h.snap.scan!.index;
    h.run(10_000);
    expect(h.snap.scan!.index).toBe(index);
    h.run(250, MOUTH);
    h.run(400, MOUTH); // dwell completes during the hold
    expect(h.snap.scan!.latched).toBeNull();
    h.run(600);
    expect(h.snap.scan!.index).toBe((index + 1) % h.snap.scan!.targets.length);
    expect(h.snap.message).toEqual([]);
    h.stepTo('phrase:2');
    expect(h.snap.message).toEqual(['I need water']);
  });

  it('a next dwell spanning an automatic scan boundary selects nothing (step fallback mode)', () => {
    const h = twoGestureStep();
    h.run(61_000);
    expect(h.snap.stepFallback).toBe(true);
    expect(h.snap.scanMode).toBe('auto');
    expect(h.snap.mapping?.mode).toBe('step'); // mapping and approval unchanged
    expect(h.snap.announcement).toMatch(/scanning is now automatic/);
    // Start a next hold just before the scan deadline so it spans the boundary.
    h.run(600);
    const start = h.snap.scan!.index;
    while (h.snap.scan!.index === start) h.step();
    h.run(1_700);
    h.run(800, MOUTH);
    h.run(800);
    expect(h.snap.message).toEqual([]);
    expect(h.snap.scan!.latched).toBeNull();
    h.selectByGesture('phrase:3');
    expect(h.snap.message).toEqual(['Please help me']);
  });

  it('the idle fallback only counts valid tracking and resets on any movement', () => {
    const h = twoGestureStep();
    h.run(50_000);
    h.run(600, MOUTH);
    h.run(30_000);
    expect(h.snap.stepFallback).toBe(false);
    h.run(10, REST);
    for (let i = 0; i < 20; i += 1) h.step(REST, 'missing');
    h.run(29_000);
    expect(h.snap.stepFallback).toBe(false);
    h.run(2_000);
    expect(h.snap.stepFallback).toBe(true);
  });

  it('previous moves back with three movements', () => {
    const h = twoGestureStep();
    addAndApprove(h, PUCKER_LIPS);
    expect(h.snap.mappingLabel).toMatch(/Pucker lips moves back/);
    h.stepTo('finish-practice');
    const length = h.snap.scan!.targets.length;
    const index = h.snap.scan!.index;
    h.run(600);
    h.run(600, MOUTH); h.run(600);
    h.run(600, MOUTH); h.run(600);
    h.run(600, PUCKER); h.run(600);
    expect(h.snap.scan!.index).toBe((index + 1) % length);
    h.run(600, PUCKER); h.run(600);
    h.run(600, PUCKER); h.run(600);
    expect(h.snap.scan!.index).toBe((index - 1 + length) % length);
    expect(h.snap.message).toEqual([]);
  });

  it('a pause movement toggles; next is ignored while paused; select also resumes', () => {
    const h = twoGestureStep();
    addAndApprove(h, PUCKER_LIPS);
    h.stepTo('finish-practice');
    addAndApprove(h, PUFF_CHEEKS);
    expect(h.snap.mappingLabel).toMatch(/Puff cheeks pauses or resumes/);
    h.stepTo('finish-practice');
    expect(h.snap.scan?.targets.map((target) => target.id)).not.toContain('add-movement');
    h.run(600);
    h.run(600, CHEEK); h.run(600);
    expect(h.snap.scan!.paused).toBe(true);
    const index = h.snap.scan!.index;
    h.run(600, MOUTH); h.run(600);
    h.run(600, PUCKER); h.run(600);
    expect(h.snap.scan!.paused).toBe(true);
    expect(h.snap.scan!.index).toBe(index);
    h.run(600, CHEEK); h.run(600);
    expect(h.snap.scan!.paused).toBe(false);
    expect(h.snap.message).toEqual([]);
    h.run(600, CHEEK); h.run(600);
    expect(h.snap.scan!.paused).toBe(true);
    h.run(600, BROW); h.run(600);
    expect(h.snap.scan!.paused).toBe(false);
    expect(h.snap.message).toEqual([]);
  });

  it('a one-movement mapping ignores the unmapped movement, which still blocks as ambiguous', () => {
    const h = new Harness();
    h.setUpToCommunication();
    addAndApprove(h, OPEN_MOUTH, 'map:2');
    expect(h.snap.mapping?.assignments).toEqual({ [h.snap.approvedModels[0]!.id]: 'select' });
    expect(h.snap.scanMode).toBe('auto');
    h.selectByGesture('finish-practice');
    h.selectByGesture('phrase:0', MOUTH);
    expect(h.snap.message).toEqual([]);
    expect(h.snap.stage).toBe('communication');
    h.run(1_000);
    h.run(800, { ...BROW, ...MOUTH });
    h.run(800);
    expect(h.snap.message).toEqual([]);
    h.selectByGesture('phrase:0');
    expect(h.snap.message).toEqual(['Yes']);
  });

  it('Change controls needs confirmation and fresh neutral; Keep current controls changes nothing', () => {
    const h = twoGestureStep();
    const before = h.snap.mapping;
    h.stepTo('change-controls');
    expect(h.snap.stage).toBe('mapping');
    expect(h.snap.decisions[0]?.id).toBe('keep-current');
    h.selectByGesture('keep-current');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.mapping).toEqual(before);

    h.stepTo('change-controls');
    h.selectByGesture('map:1'); // mouth selects, brow moves next
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.mapping).toEqual(before);
    h.selectByGesture('choose-different');
    expect(h.snap.stage).toBe('mapping');
    expect(h.snap.mapping).toEqual(before);
    h.selectByGesture('map:1');
    h.selectByGesture('approve-mapping', BROW, 60_000, 600, 0);
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.runtime?.armed).toBe(false);
    const [brow, mouth] = h.snap.approvedModels;
    expect(h.snap.mapping?.assignments).toEqual({ [mouth!.id]: 'select', [brow!.id]: 'next' });
    expect(h.snap.cycles).toHaveLength(2); // remapping never retrains
  });

  it('Use previous controls returns to the earlier mapping only after approval', () => {
    const h = twoGestureStep();
    const original = h.snap.mapping;
    h.stepTo('change-controls');
    h.selectByGesture('map:1');
    h.selectByGesture('approve-mapping');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.scan?.targets.map((target) => target.id)).toContain('use-previous');
    h.stepTo('use-previous', BROW, MOUTH); // now brow moves next and mouth selects
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.pendingMapping?.assignments).toEqual(original?.assignments);
    expect(h.snap.mapping).not.toEqual(original);
    h.selectByGesture('approve-mapping');
    expect(h.snap.mapping).toEqual(original);
  });

  it('with four movements every communication control is reachable and works', () => {
    const h = twoGestureStep();
    addAndApprove(h, PUCKER_LIPS);
    h.stepTo('finish-practice');
    addAndApprove(h, PUFF_CHEEKS);
    h.stepTo('finish-practice');
    const reach = (expected: string[]) => {
      const ids = h.snap.scan!.targets.map((target) => target.id);
      expect(ids).toEqual(expected);
      const seen = new Set<string>();
      h.run(600);
      for (let i = 0; i < ids.length; i += 1) { seen.add(h.highlightedId()!); h.run(600, MOUTH); h.run(600); }
      expect([...seen].sort()).toEqual([...ids].sort());
    };
    reach(['phrase:0', 'phrase:1', 'phrase:2', 'phrase:3', 'phrase:4', 'phrase:5', 'pause', 'helper']);
    h.stepTo('helper');
    reach(['close-helper', 'change-controls', 'recalibrate', 'practice', 'pause']);
    h.stepTo('close-helper');
    h.stepTo('phrase:5');
    h.stepTo('speak');
    expect(h.spoken).toEqual(['Thank you']);
    h.stepTo('phrase:0');
    h.stepTo('clear'); // behind Helper, then confirmed
    h.stepTo('clear-yes');
    expect(h.snap.message).toEqual([]);
    h.stepTo('pause');
    expect(h.snap.scan!.paused).toBe(true);
    h.run(600, BROW); h.run(600);
    expect(h.snap.scan!.paused).toBe(false);
    h.stepTo('practice');
    expect(h.snap.stage).toBe('practice');
    h.stepTo('finish-practice');
    h.stepTo('recalibrate');
    expect(h.snap.confirmingRecalibrate).toBe(true);
    h.stepTo('recalibrate-no');
    expect(h.snap.approvedModels).toHaveLength(4);
    h.stepTo('change-controls');
    expect(h.snap.stage).toBe('mapping');
    expect(h.snap.decisions.filter((decision) => decision.id.startsWith('map:'))).toHaveLength(8);
  });

  it('with three movements a mapping without next keeps automatic scanning and speed controls', () => {
    const h = twoGestureStep();
    addAndApprove(h, PUCKER_LIPS, 'map:3'); // brow alone selects
    h.selectByGesture('finish-practice');
    h.selectByGesture('helper');
    const ids = h.snap.scan!.targets.map((target) => target.id);
    expect(ids).toEqual(expect.arrayContaining(['slower', 'faster', 'add-movement', 'change-controls', 'recalibrate', 'pause']));
    h.selectByGesture('slower');
    expect(h.snap.scan!.intervalMs).toBe(2_500);
  });

  it('assisted input is unaffected by a gesture set and switching back restores step scanning', () => {
    const h = twoGestureStep();
    h.session.useAssisted();
    expect(h.snap.inputMode).toBe('assisted');
    expect(h.snap.scan?.driver).toBe('assisted');
    h.run(1_000);
    h.run(800, MOUTH); h.run(800);
    h.run(800, BROW); h.run(800);
    expect(h.snap.message).toEqual([]);
    while (h.highlightedId() !== 'phrase:1') h.step();
    h.session.switchPress(h.now);
    expect(h.snap.message).toEqual(['No']);
    expect(h.snap.approvedModels).toHaveLength(2);
    h.session.useGesture();
    expect(h.snap.inputMode).toBe('gesture');
    expect(h.snap.scanMode).toBe('step');
  });

  it('recalibration keeps the whole set on cancel and replaces it only after a new approval', () => {
    const h = twoGestureStep();
    const before = { models: h.snap.approvedModels, mapping: h.snap.mapping };
    h.stepTo('recalibrate');
    h.stepTo('recalibrate-yes');
    expect(h.snap.stage).toBe('baseline');
    h.run(10_500);
    expect(h.snap.stage).toBe('choose');
    h.session.cancel();
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['restart-recalibration', 'another-movement', 'keep-current']);
    h.selectByGesture('keep-current', MOUTH); // any approved movement drives setup choices
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.approvedModels).toEqual(before.models);
    expect(h.snap.mapping).toEqual(before.mapping);
    expect(h.snap.scanMode).toBe('step');

    h.stepTo('recalibrate');
    h.stepTo('recalibrate-yes');
    h.run(10_500);
    h.selectByGesture('same-movement');
    expect(h.snap.stage).toBe('training');
    h.followPrompts((snap) => snap.stage === 'negative', BROW);
    expect(h.snap.cycles.at(-1)!.heldOut.every((attempt) => attempt.kind === 'held-out')).toBe(true);
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.approvedModels).toEqual(before.models);
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['record-again', 'approve-comfortable', 'approve-effort', 'another-movement', 'keep-current']);
    h.selectByGesture('approve-comfortable');
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(h.snap.scanMode).toBe('auto');
    // The old two-movement controls refer to movements that no longer exist.
    expect(h.snap.scan?.targets.map((target) => target.id)).not.toContain('use-previous');
  });

  it('a paused step scan stays paused through a minute of rest and selects nothing', () => {
    const h = twoGestureStep();
    h.stepTo('pause');
    expect(h.snap.scan!.paused).toBe(true);
    h.run(61_000);
    expect(h.snap.scan!.paused).toBe(true);
    expect(h.snap.stepFallback).toBe(false);
    h.run(600, MOUTH); h.run(600);
    expect(h.snap.scan!.paused).toBe(true);
    h.run(600, BROW); h.run(600); // select resumes, never selects
    expect(h.snap.scan!.paused).toBe(false);
    expect(h.snap.message).toEqual([]);
  });

  it('an old movement during the added movement\'s everyday check fails it (negative window over the set)', () => {
    const h = new Harness();
    h.setUpToCommunication();
    h.selectByGesture('add-movement');
    h.session.chooseMovement(OPEN_MOUTH);
    h.followPrompts((snap) => snap.stage === 'negative', (snap) => perform(snap.capture?.movement ?? null));
    h.run(2_000);
    h.run(800, BROW);
    h.run(800);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.cycles[1]!.negative).toMatchObject({ passed: false, eventCount: 1 });
    expect(h.snap.approvedModels).toHaveLength(1);
  });

  it('only the select movement latches; a next or unmapped hold never freezes automatic scanning', () => {
    const h = twoGestureStep();
    h.run(61_000);
    expect(h.snap.stepFallback).toBe(true);
    h.run(600);
    h.run(200, MOUTH); // next dwell in progress, before its event
    expect(h.snap.scan!.latched).toBeNull();
    h.run(600, MOUTH); h.run(600);

    const one = new Harness();
    one.setUpToCommunication();
    addAndApprove(one, OPEN_MOUTH, 'map:2'); // brow alone selects; mouth unmapped
    one.selectByGesture('finish-practice');
    one.run(600);
    one.run(200, MOUTH);
    expect(one.snap.scan!.latched).toBeNull();
    one.run(600, MOUTH);
    one.run(400);
    const index = one.snap.scan!.index;
    one.run(one.snap.scan!.intervalMs + 100);
    expect(one.snap.scan!.index).not.toBe(index);
  });

  it('the step fallback needs fresh neutral, a cancelled dwell resets the idle timer, and re-approval restores step mode', () => {
    const h = twoGestureStep();
    h.run(59_000);
    h.run(150, MOUTH); // too short to emit: started, then cancelled
    h.run(600);
    h.run(59_000);
    expect(h.snap.stepFallback).toBe(false);
    h.run(2_000);
    expect(h.snap.stepFallback).toBe(true);

    const g = twoGestureStep();
    g.run(57_000);
    expect(g.snap.stepFallback).toBe(false);
    for (let i = 0; i < 100 && !g.snap.stepFallback; i += 1) g.step(REST);
    expect(g.snap.stepFallback).toBe(true);
    expect(g.snap.runtime?.armed).toBe(false);

    g.selectByGesture('change-controls');
    g.selectByGesture('map:0');
    g.selectByGesture('approve-mapping');
    expect(g.snap.stepFallback).toBe(false);
    expect(g.snap.scanMode).toBe('step');
  });

  it('a helper\'s Pause and Resume clicks restart the step idle timer', () => {
    const h = twoGestureStep();
    h.run(50_000);
    h.session.selectTarget('pause');
    expect(h.snap.scan!.paused).toBe(true);
    h.run(5_000);
    h.session.resume();
    h.run(50_000);
    expect(h.snap.stepFallback).toBe(false);
  });
});
