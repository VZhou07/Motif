import { describe, expect, it } from 'vitest';
import { BROW, HEAD_WOBBLE, Harness, MOUTH, REST, type Values } from './session.test-support';

/** A movement held for 1 s every 4 s (starting 0.5 s in), on top of rest. */
const every4s = (values: Values, offset = 500) => (t: number): Values => ((t - offset) % 4_000 >= 0 && (t - offset) % 4_000 < 1_000 ? values : REST);
const both = (a: (t: number) => Values, b: (t: number) => Values) => (t: number): Values => ({ ...a(t), ...b(t) });

function atChoose(): Harness {
  const h = new Harness();
  h.session.setCamera('running');
  h.session.startBaseline();
  h.run(10_500);
  expect(h.snap.stage).toBe('choose');
  return h;
}

/** Explore for the 20 valid seconds; `at` gets time relative to the start. */
function explore(h: Harness, at: (t: number) => Values): void {
  const start = h.now;
  h.run(20_500, (now) => at(now - start));
}

const ids = (h: Harness) => h.snap.decisions.map((decision) => decision.id);

describe('free movement discovery in the session (R9)', () => {
  it('proposes candidates from free exploration without creating any model', () => {
    const h = atChoose();
    h.session.startDiscovery();
    expect(h.snap.stage).toBe('discover');
    expect(h.snap.capture).toMatchObject({ kind: 'discovery', prompt: 'Explore freely' });
    explore(h, every4s(MOUTH));
    expect(h.snap.stage).toBe('discover-results');
    expect(h.snap.discovery?.candidates.map((candidate) => [candidate.label, candidate.episodes])).toEqual([['Open mouth', 5]]);
    expect(ids(h)).toEqual(['discovered:0', 'discover-again', 'full-list']);
    expect(h.snap.candidate).toBeNull();
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.cycles).toEqual([]);
    expect(h.snap.scan).toBeNull(); // first run: helper buttons only, nothing can act
    expect(JSON.stringify(h.snap.discovery)).not.toMatch(/timestampMs|values/); // summaries only, no frames

    h.session.chooseSetupTarget('discovered:0');
    expect(h.snap.stage).toBe('training');
    expect(h.snap.choice).toEqual({ feature: 'jawOpen', direction: 1, label: 'Open mouth' });
    expect(h.snap.discovery).toBeNull();
  });

  it('a discovered movement still goes through training, checks and approval', () => {
    const h = atChoose();
    h.session.startDiscovery();
    explore(h, every4s(MOUTH));
    h.session.chooseSetupTarget('discovered:0');
    h.followPrompts((snap) => snap.stage === 'negative', MOUTH);
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.approvedModels).toEqual([]);
    h.selectByGesture('approve-comfortable', MOUTH);
    expect(h.snap.approvedModels.map((model) => model.label)).toEqual(['Open mouth']);
  });

  it('offers a grouped companion instead of the primary', () => {
    const h = atChoose();
    h.session.startDiscovery();
    explore(h, every4s({ jawOpen: 0.7, mouthPucker: 0.6 }));
    expect(ids(h)).toEqual(['discovered:0', 'discovered:0:0', 'discover-again', 'full-list']);
    expect(h.snap.decisions[1]!.label).toBe('Use “Purse lips” instead');
    h.session.chooseSetupTarget('discovered:0:0');
    expect(h.snap.choice?.feature).toBe('mouthPucker');
  });

  it('says plainly when nothing was found and offers to look again or use the list', () => {
    const h = atChoose();
    h.session.startDiscovery();
    explore(h, () => REST);
    expect(h.snap.discovery?.candidates).toEqual([]);
    expect(h.snap.discovery?.reason).toMatch(/No repeated movement/);
    expect(ids(h)).toEqual(['discover-again', 'full-list']);
    h.session.decide('discover-again');
    expect(h.snap.stage).toBe('discover');
    h.session.cancel();
    expect(h.snap.stage).toBe('setup-failed');
    expect(ids(h)).not.toContain('record-again');
    h.session.decide('another-movement');
    expect(h.snap.stage).toBe('choose');
    h.session.startDiscovery();
    explore(h, () => REST);
    h.session.decide('full-list');
    expect(h.snap.stage).toBe('choose');
  });

  it('keeps exploring across short tracking losses and fails honestly on the fifth', () => {
    const h = atChoose();
    h.session.startDiscovery();
    h.run(3_000, every4s(MOUTH));
    for (let i = 0; i < 4; i += 1) { h.step(REST, 'missing'); h.run(1_000); }
    expect(h.snap.stage).toBe('discover');
    expect(h.snap.capture?.interruptions).toBe(4);
    h.step(REST, 'missing');
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.kind).toBe('discovery');
    h.session.startDiscovery();
    expect(h.snap.stage).toBe('discover');
  });

  it('when adding, hides approved movements and is operable with an approved movement', () => {
    const h = new Harness();
    h.setUpToCommunication();
    h.selectByGesture('add-movement');
    expect(ids(h)).toEqual(['discover', 'keep-current']);
    h.selectByGesture('discover');
    expect(h.snap.stage).toBe('discover');
    expect(h.snap.scan).toBeNull(); // no approved model runs while exploring
    explore(h, both(every4s(BROW), every4s(MOUTH, 2_500)));
    expect(h.snap.stage).toBe('discover-results');
    expect(h.snap.discovery?.candidates.map((candidate) => candidate.label)).toEqual(['Open mouth']);
    expect(ids(h)).toEqual(['discovered:0', 'discover-again', 'full-list', 'keep-current']);
    expect(h.snap.scan?.driver).toBe('gesture');
    h.selectByGesture('discovered:0');
    expect(h.snap.stage).toBe('training');
    expect(h.snap.choice?.label).toBe('Open mouth');
    expect(h.snap.approvedModels).toHaveLength(1);
  });

  it('ignores discovered choices outside the results stage', () => {
    const h = atChoose();
    h.session.chooseSetupTarget('discovered:0');
    expect(h.snap.stage).toBe('choose');
  });

  it('clears an earlier movement choice so a discovery failure never offers to record it again', () => {
    const h = atChoose();
    h.session.chooseMovement({ feature: 'jawOpen', direction: 1, label: 'Open mouth' });
    h.session.cancel();
    expect(h.snap.choice?.label).toBe('Open mouth');
    h.session.decide('another-movement');
    h.session.startDiscovery();
    expect(h.snap.choice).toBeNull();
    for (let i = 0; i < 5; i += 1) { h.run(500); h.step(REST, 'missing'); }
    expect(h.snap.failure?.kind).toBe('discovery');
    expect(ids(h)).not.toContain('record-again');
  });

  it('drops explored frames: looking again never reuses an earlier exploration', () => {
    const h = atChoose();
    h.session.startDiscovery();
    explore(h, every4s(MOUTH));
    expect(h.snap.discovery?.candidates).toHaveLength(1);
    h.session.decide('discover-again');
    explore(h, () => REST);
    expect(h.snap.discovery?.candidates).toEqual([]);
  });
});
