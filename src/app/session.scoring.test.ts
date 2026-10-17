import { describe, expect, it } from 'vitest';
import { BROW, Harness, MOUTH, PUCKER, REST, type Values } from './session.test-support';
import type { MovementChoice } from './types';

const BROW_LABEL = 'Raise left outer eyebrow';
const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const PUCKER_LIPS = { feature: 'mouthPucker', direction: 1, label: 'Pucker lips' } as const;
const MOVES: Record<string, Values> = { [BROW_LABEL]: BROW, 'Open mouth': MOUTH, 'Pucker lips': PUCKER };
const perform = (label: string | null): Values => MOVES[label ?? ''] ?? REST;

/** From communication: add, verify and rate a movement, then approve `proposal`. */
function add(h: Harness, choice: MovementChoice, comfort: 'comfortable' | 'comfortable-effort' = 'comfortable', proposal = 'map:0'): void {
  h.addMovement(choice, perform);
  expect(h.snap.stage).toBe('comfort');
  h.selectByGesture(comfort);
  h.selectByGesture(proposal);
  h.selectByGesture('approve-mapping');
}

function twoStep(): Harness {
  const h = new Harness();
  h.setUpToCommunication();
  add(h, OPEN_MOUTH);
  h.stepTo('finish-practice');
  return h;
}

const evidenceOf = (h: Harness, label: string) => h.snap.evidence.find((item) => item.label === label)!;
const decisionIds = (h: Harness) => h.snap.decisions.map((decision) => decision.id);

describe('effort and observed use (R8)', () => {
  it('asks about effort, records it per movement and continues either way', () => {
    const h = new Harness();
    h.calibrate();
    expect(decisionIds(h)).toEqual(['comfortable', 'comfortable-effort', 'record-again', 'another-movement']);
    const easy = new Harness();
    easy.calibrate();
    easy.selectByGesture('comfortable');
    expect(evidenceOf(easy, BROW_LABEL).effort).toBe('easy');
    h.selectByGesture('comfortable-effort');
    expect(h.snap.stage).toBe('mapping');
    expect(evidenceOf(h, BROW_LABEL).effort).toBe('effort');
    expect(evidenceOf(h, BROW_LABEL).checks).toEqual({ passed: 2, total: 2 });
    expect(evidenceOf(h, BROW_LABEL).everyday.windows).toBe(1);
  });

  it('counts completed and released holds only while communicating, never tracking loss or setup', () => {
    const h = new Harness();
    h.setUpToCommunication();
    const before = evidenceOf(h, BROW_LABEL).use; // practice finish-practice hold counts; setup holds do not
    expect(before).toEqual({ completed: 1, unfinished: 0 });
    h.run(600);
    h.run(150, BROW); // released before the dwell completed
    h.run(600);
    expect(evidenceOf(h, BROW_LABEL).use).toEqual({ completed: 1, unfinished: 1 });
    h.run(150, BROW);
    for (let i = 0; i < 4; i += 1) h.step(REST, 'missing'); // tracking loss mid-dwell
    h.run(600);
    expect(evidenceOf(h, BROW_LABEL).use).toEqual({ completed: 1, unfinished: 1 });
    h.selectByGesture('phrase:g1:0'); // two holds: open Quick, then Yes (R14)
    expect(evidenceOf(h, BROW_LABEL).use).toEqual({ completed: 3, unfinished: 1 });
  });

  it('does not count a hold cancelled by another movement joining', () => {
    const h = twoStep();
    const before = evidenceOf(h, BROW_LABEL).use.unfinished;
    h.run(600);
    h.run(100, BROW);
    h.run(400, { ...BROW, ...MOUTH });
    h.run(600);
    expect(evidenceOf(h, BROW_LABEL).use.unfinished).toBe(before);
  });
});

describe('recommendations (R8)', () => {
  it('leaves a movement marked as taking effort unused and recommends automatic scanning', () => {
    const h = new Harness();
    h.setUpToCommunication();
    h.addMovement(OPEN_MOUTH, perform);
    h.selectByGesture('comfortable-effort');
    expect(h.snap.stage).toBe('mapping');
    expect(decisionIds(h)).toEqual(['keep-current', 'map:2', 'map:0', 'map:1', 'map:3', 'reject']);
    expect(h.snap.decisions[1]!.label).toBe('Recommended: Raise left outer eyebrow selects (automatic scanning)');
    expect(h.snap.recommendation?.id).toBe('map:2');
    expect(h.snap.recommendation?.reasons.join(' ')).toMatch(/Open mouth is left unused because you marked it as taking effort/);
    expect(h.snap.approvedModels).toHaveLength(1); // nothing changes until approval
    h.selectByGesture('map:2');
    expect(h.snap.stage).toBe('mapping-confirm');
    h.selectByGesture('approve-mapping');
    expect(h.snap.scanMode).toBe('auto');
    expect(h.snap.approvedModels).toHaveLength(2);
  });

  it('adds a separate recommended proposal when the evidence reorders the movements', () => {
    const h = twoStep();
    add(h, PUCKER_LIPS);
    h.stepTo('finish-practice');
    h.run(600);
    for (let i = 0; i < 2; i += 1) { h.run(150, MOUTH); h.run(600); } // two unfinished mouth holds
    expect(evidenceOf(h, 'Open mouth').use.unfinished).toBe(2);
    h.stepTo('change-controls');
    expect(decisionIds(h).slice(0, 2)).toEqual(['keep-current', 'map:recommended']);
    expect(h.snap.decisions[1]!.label).toBe('Recommended: Raise left outer eyebrow selects · Pucker lips moves next · Open mouth moves back (step by step, no timer)');
    expect(decisionIds(h).filter((id) => id.startsWith('map:'))).toHaveLength(7);
    h.selectByGesture('map:recommended');
    expect(h.snap.pendingMapping?.label).toMatch(/^Recommended:/);
    const before = h.snap.mapping;
    expect(h.snap.mapping).toEqual(before);
    h.selectByGesture('approve-mapping');
    const [brow, mouth, pucker] = h.snap.approvedModels;
    expect(h.snap.mapping?.assignments).toEqual({ [brow!.id]: 'select', [pucker!.id]: 'next', [mouth!.id]: 'previous' });
  });
});

describe('reporting a tiring movement (R8)', () => {
  it('is offered only with two or more movements', () => {
    const one = new Harness();
    one.setUpToCommunication();
    one.selectByGesture('more');
    expect(one.snap.scan?.targets.map((target) => target.id)).not.toContain('tiring');
    const two = twoStep();
    two.stepTo('more');
    expect(two.snap.scan?.targets.map((target) => target.id)).toContain('tiring');
  });

  it('lets the person name the movement, then recommends controls that leave it unused', () => {
    const h = twoStep();
    h.stepTo('phrase:g2:0');
    const [brow, mouth] = h.snap.approvedModels;
    h.stepTo('tiring');
    expect(h.snap.stage).toBe('tiring');
    expect(decisionIds(h)).toEqual([`tiring:${brow!.id}`, `tiring:${mouth!.id}`, 'never-mind']);
    h.selectByGesture('never-mind');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.message).toEqual(['I need water']);
    expect(evidenceOf(h, 'Open mouth').tiringReports).toBe(0);

    h.stepTo('tiring');
    h.selectByGesture(`tiring:${mouth!.id}`, MOUTH);
    expect(h.snap.stage).toBe('mapping');
    expect(evidenceOf(h, 'Open mouth').tiringReports).toBe(1);
    expect(h.snap.recommendation?.reasons.join(' ')).toMatch(/Open mouth is left unused because you reported it tiring once/);
    expect(h.snap.mapping?.assignments).toEqual({ [brow!.id]: 'select', [mouth!.id]: 'next' }); // unchanged until Approve
    h.selectByGesture('keep-current');
    expect(h.snap.message).toEqual(['I need water']);
  });

  it('ignores tiring choices outside the tiring stage', () => {
    const h = twoStep();
    const mouth = h.snap.approvedModels[1]!;
    h.session.chooseSetupTarget(`tiring:${mouth.id}`);
    expect(h.snap.stage).toBe('communication');
    expect(evidenceOf(h, 'Open mouth').tiringReports).toBe(0);
  });
});

describe('custom controls (R8, helper form)', () => {
  it('validates, then still needs approval', () => {
    const h = twoStep();
    const [brow, mouth] = h.snap.approvedModels;
    expect(h.session.proposeCustom({ [brow!.id]: 'select' })).toBe(false); // only in mapping
    h.stepTo('change-controls');
    expect(h.session.proposeCustom({ [brow!.id]: 'next' })).toBe(false);
    expect(h.snap.stage).toBe('mapping');
    expect(h.snap.announcement).toMatch(/Exactly one movement must select/);
    expect(h.session.proposeCustom({ [mouth!.id]: 'select', [brow!.id]: 'pause' })).toBe(true);
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.pendingMapping?.label).toBe('Custom: Open mouth selects · Raise left outer eyebrow pauses or resumes (automatic scanning)');
    expect(h.snap.mapping?.assignments).toEqual({ [brow!.id]: 'select', [mouth!.id]: 'next' });
    h.selectByGesture('approve-mapping');
    expect(h.snap.mapping?.assignments).toEqual({ [mouth!.id]: 'select', [brow!.id]: 'pause' });
  });
});

describe('evidence edge cases (R8)', () => {
  it('validates custom controls against the movements being set up while adding', () => {
    const h = new Harness();
    h.setUpToCommunication();
    h.addMovement(OPEN_MOUTH, perform);
    h.selectByGesture('comfortable');
    const [mouth] = h.snap.setupModels.filter((model) => model.label === 'Open mouth');
    const brow = h.snap.approvedModels[0]!;
    expect(h.session.proposeCustom({ [mouth!.id]: 'select', [brow.id]: 'next' })).toBe(true);
    h.selectByGesture('approve-mapping');
    expect(h.snap.mapping?.assignments).toEqual({ [mouth!.id]: 'select', [brow.id]: 'next' });
  });

  it('counts holds that are consumed while paused or unmapped as completed', () => {
    const h = new Harness();
    h.setUpToCommunication();
    add(h, OPEN_MOUTH, 'comfortable', 'map:2'); // brow alone selects; mouth unmapped
    h.selectByGesture('finish-practice');
    const before = evidenceOf(h, 'Open mouth').use.completed;
    h.run(600); h.run(600, MOUTH); h.run(600);
    expect(evidenceOf(h, 'Open mouth').use.completed).toBe(before + 1);
    h.selectByGesture('pause');
    const paused = evidenceOf(h, 'Open mouth').use.completed;
    h.run(600, MOUTH); h.run(600);
    expect(evidenceOf(h, 'Open mouth').use.completed).toBe(paused + 1);
  });
});
