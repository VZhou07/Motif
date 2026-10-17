import { describe, expect, it } from 'vitest';
import { BROW, Harness, REST } from './session.test-support';

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

    h.selectByGesture('comfortable');
    expect(h.snap.stage).toBe('mapping');
    expect(h.snap.approvedModel).toBeNull();
    h.selectByGesture('approve');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModel?.feature).toBe('browOuterUpLeft');
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
    h.session.decide('approve');
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
    h.followPrompts((snap) => snap.capture?.prompt === 'Move');
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
    expect(h.highlightedId()).toBe('phrase:1');
    h.run(600);
    expect(h.snap.message).toEqual(['No']);
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
    expect(h.snap.stage).toBe('recalibrate-confirm');
    h.selectByGesture('keep-current', BROW, 60_000, 3_000, 0);
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
    h.selectByGesture('start-recalibration');
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
    h.selectByGesture('start-recalibration');
    h.run(10_500);
    expect(h.snap.stage).toBe('choose');
    h.selectByGesture('same-movement');
    h.followPrompts((snap) => snap.stage === 'negative');
    h.run(11_000);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.approvedModel).toEqual(old);
    h.selectByGesture('comfortable');
    h.selectByGesture('approve');
    expect(h.snap.approvedModel?.id).not.toBe(old.id);
    expect(h.snap.cycles.at(-1)?.outcome).toBe('approved');
  });

  it('ignores setup decisions that are not currently offered', () => {
    const h = ready();
    h.session.decide('approve');
    h.session.decide('start-recalibration');
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
    for (let i = 0; i < 8; i += 1) h.stall(2_000);
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
    expect(negative.reasons).toContain('Ten armed seconds were not observed within one minute.');
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
      expect(h.spoken.slice(0, 3)).toEqual(enabled ? ['Rest', 'Move', 'Return to rest'] : []);
    }
  });
});
