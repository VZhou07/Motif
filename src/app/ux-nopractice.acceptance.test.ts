import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLocalProfileStore, createMemoryStorage } from './profiles';
import { BROW, HEAD_WOBBLE, Harness, MOUTH, REST, type Values } from './session.test-support';

// R20: the practice page is gone and "Speak" is "Play". P1-P5, P7 (session level). See UX_ACCEPTANCE.md.

const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const perform = (label: string | null): Values => (label === 'Open mouth' ? MOUTH : label ? BROW : REST);
const PH = ['phrase:g1:0', 'phrase:g1:1', 'phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2', 'phrase:g1:2'];

const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);
const labels = (h: Harness) => h.snap.scan!.targets.map((target) => target.label);
const say = (h: Harness, ...list: string[]) => { for (const id of list) h.click(id); };
const raw = (h: Harness, ...list: string[]) => { for (const id of list) h.session.selectTarget(id); };
const kind = (h: Harness) => h.snap.level?.kind;
const stagesSeen = (h: Harness) => { const seen = new Set<string>(); h.session.subscribe(() => seen.add(h.session.getSnapshot().stage)); return seen; };
const use = (h: Harness, label: string) => h.snap.evidence.find((item) => item.label === label)!.use;
const BROW_LABEL = 'Raise left outer eyebrow';
const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function ready(options: ConstructorParameters<typeof Harness>[0] = {}): Harness { const h = new Harness(options); h.setUpToCommunication(); expect(h.snap.stage).toBe('communication'); return h; }
function ready2(): Harness {
  const h = ready();
  h.addMovement(OPEN_MOUTH, perform);
  h.selectByGesture('choose-different');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  expect(h.snap.approvedModels).toHaveLength(2);
  return h;
}
function savedSetup() {
  const storage = createMemoryStorage();
  const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
  first.setUpToCommunication();
  return { now: first.now, options: { profiles: createLocalProfileStore(() => storage) } };
}
function restoring(quick: boolean): Harness {
  const { now, options } = savedSetup();
  const h = new Harness(options);
  h.now = now + 5_000;
  h.session.setCamera('running');
  expect(h.session.restoreProfile('Last setup', quick)).toBe(true);
  return h;
}
function recheckedToComfort(): Harness {
  const h = restoring(false);
  h.run(10_500);
  h.followPrompts((s) => s.stage === 'negative' || s.stage === 'setup-failed', (s) => perform(s.capture?.movement ?? null));
  h.run(11_000, HEAD_WOBBLE);
  expect(h.snap.stage).toBe('comfort');
  return h;
}
/** Two movements, controls A in use, then B approved from Change controls, so A is the previous mapping. */
function withPreviousMapping(): Harness {
  const h = ready2();
  const before = JSON.stringify(h.snap.mapping);
  say(h, 'change-controls');
  const other = h.snap.decisions.map((decision) => decision.id).filter((id) => id.startsWith('map:')).find((id) => {
    const card = (h.snap as unknown as { proposals: Array<{ id: string; inUse: boolean }> }).proposals.find((entry) => entry.id === id);
    return card && !card.inUse;
  })!;
  h.session.chooseSetupTarget(other);
  h.session.decide('approve-mapping');
  expect(h.snap.stage).toBe('communication');
  expect(JSON.stringify(h.snap.mapping)).not.toBe(before);
  return h;
}

describe('P1 no practice stage; approval ends on the board', () => {
  it('P1 the source has no practice stage, finish-practice or snapshot.practice', () => {
    expect(src('src/app/types.ts')).not.toMatch(/'practice'/);
    for (const file of ['src/app/session.ts', 'src/app/navigation.ts', 'src/components/CommunicationView.tsx', 'src/components/HelperPanel.tsx', 'src/App.tsx']) {
      expect([file, /finish-practice|enterPractice|'practice'/.test(src(file))]).toEqual([file, false]);
    }
    expect('practice' in new Harness().snap).toBe(false);
  });

  const paths: Array<[string, () => { h: Harness; approve: (h: Harness) => void }]> = [
    ['first movement', () => { const h = new Harness(); h.calibrate(); return { h, approve: (x) => x.session.decide('approve-comfortable') }; }],
    ['first movement, takes effort', () => { const h = new Harness(); h.calibrate(); return { h, approve: (x) => x.session.decide('approve-effort') }; }],
    ['adding', () => { const h = ready(); h.addMovement(OPEN_MOUTH, perform); return { h, approve: (x) => x.session.decide('approve-comfortable') }; }],
    ['recalibrating', () => {
      const h = ready();
      say(h, 'recalibrate', 'recalibrate-yes');
      h.run(10_500);
      h.session.decide('same-movement');
      h.followPrompts((s) => s.stage === 'negative' || s.stage === 'setup-failed', (s) => perform(s.capture?.movement ?? null));
      h.run(11_000, HEAD_WOBBLE);
      return { h, approve: (x) => x.session.decide('approve-comfortable') };
    }],
    ['Continue, approve-saved', () => ({ h: recheckedToComfort(), approve: (x) => x.session.decide('approve-saved') })],
    ['quick restore confirm', () => ({ h: restoring(true), approve: (x) => x.session.decide('approve-mapping') })],
    ['mapping-confirm Approve', () => {
      const h = ready();
      h.addMovement(OPEN_MOUTH, perform);
      h.session.decide('choose-different');
      h.session.chooseSetupTarget('map:0');
      expect(h.snap.stage).toBe('mapping-confirm');
      return { h, approve: (x) => x.session.decide('approve-mapping') };
    }],
  ];
  for (const [name, make] of paths) {
    it(`P1 ${name}: approval goes straight to communication, speaks nothing, and no practice list exists`, () => {
      const { h, approve } = make();
      const seen = stagesSeen(h);
      approve(h);
      expect(h.snap.stage).toBe('communication');
      expect([...seen]).not.toContain('practice');
      expect(h.spoken).toEqual([]);
      expect(h.snap.message).toEqual([]);
      expect(h.snap.lastSpoken).toBeNull();
      expect(ids(h)).toEqual(expect.arrayContaining(['speak', 'undo', 'pause', 'more']));
      expect(ids(h)).not.toContain('finish-practice');
      expect(h.snap.announcement).toMatch(/You're ready to talk/);
      expect(h.snap.announcement).not.toMatch(/practice/i);
    });
  }

  it('P1 approval with a previous mapping says Change controls can bring it back', () => {
    const h = withPreviousMapping();
    expect(h.snap.announcement).toMatch(/Change controls can bring back your previous controls/);
  });
});

describe('P2 the approving hold does not leak into talking', () => {
  it('P2 a hold that continues after approval adds no phrase and does not Play', () => {
    const h = new Harness();
    h.calibrate();
    // Approve by gesture, then keep holding the same movement for three more seconds.
    h.selectByGesture('approve-comfortable', BROW, 60_000, 3_000, 0);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.message).toEqual([]);
    expect(h.spoken).toEqual([]);
    expect(h.snap.lastSpoken).toBeNull();
    expect(h.snap.runtime?.armed).toBe(false); // fresh neutral is needed first
  });

  it('P2 the same holds when the approving hold lands on a later scan target', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable', BROW, 60_000, 4_000, 0);
    h.run(5_000, BROW);
    expect(h.snap.message).toEqual([]);
    expect(h.spoken).toEqual([]);
    expect(use(h, BROW_LABEL)).toEqual({ completed: 0, unfinished: 0 });
  });

  it('P2 after fresh neutral the next hold selects exactly once (one action per hold)', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable', BROW, 60_000, 3_000, 0);
    h.run(1_500, REST);
    expect(h.snap.runtime?.armed).toBe(true);
    h.selectByGesture('phrase:g1:0', BROW, 60_000, 4_000, 800);
    expect(h.snap.message).toEqual(['Yes']);
    expect(h.spoken).toEqual([]);
  });

  it('P2 approving by a click (helper) also needs fresh neutral before any selection', () => {
    const h = new Harness();
    h.calibrate();
    h.session.decide('approve-comfortable');
    expect(h.snap.runtime?.armed).toBe(false);
    h.run(4_000, BROW);
    expect(h.snap.message).toEqual([]);
    expect(h.spoken).toEqual([]);
  });
});

describe('P3 no Helper practice control', () => {
  it('P3 neither the gesture nor the assisted Helper has a Practice item, and no scan label mentions practice', () => {
    const g = ready();
    raw(g, 'more');
    expect(ids(g)).not.toContain('practice');
    expect(labels(g).join(' ')).not.toMatch(/practice/i);
    const a = new Harness();
    a.session.useAssisted();
    a.switchTo('more');
    expect(ids(a)).not.toContain('practice');
    expect(labels(a).join(' ')).not.toMatch(/practice/i);
    raw(g, 'practice');
    expect(g.snap.stage).toBe('communication');
  });

  it('P3 no scan label on any communication level mentions practice', () => {
    const h = ready();
    const all: string[] = [...labels(h)];
    for (const open of ['more', 'back']) { raw(h, open); all.push(...labels(h)); }
    raw(h, 'group:g1');
    say(h, 'more', 'clear');
    all.push(...labels(h));
    raw(h, 'clear-no');
    say(h, 'recalibrate');
    all.push(...labels(h));
    expect(all.join(' ')).not.toMatch(/practice/i);
  });

  it('P3 the step-idle fallback and Helper levels work as before', () => {
    const h = ready2();
    say(h, PH[0], 'more');
    expect(kind(h)).toBe('more');
    h.run(61_000, REST);
    expect(h.snap.stepFallback).toBe(true);
    expect(kind(h)).toBe('top');
    expect(h.snap.message).toEqual(['Yes']);
    expect(h.snap.stage).toBe('communication');
  });
});

describe('P4 use-previous in Change controls', () => {
  it('P4 is offered after the cards and before reject, only with a valid previous mapping and no candidate', () => {
    const h = withPreviousMapping();
    say(h, 'change-controls');
    expect(h.snap.stage).toBe('mapping');
    const list = h.snap.decisions.map((decision) => decision.id);
    expect(list).toContain('use-previous');
    const lastCard = Math.max(...list.map((id, index) => (id.startsWith('map:') ? index : -1)));
    expect(list.indexOf('use-previous')).toBeGreaterThan(lastCard);
    for (const later of ['reject', 'reject-profile']) if (list.includes(later)) expect(list.indexOf(later)).toBeGreaterThan(list.indexOf('use-previous'));
    expect(h.snap.scan!.targets.find((target) => target.id === 'use-previous')!.label).toBe('Use previous controls');
    expect(ids(h)).toEqual(list);
  });

  it('P4 selecting it opens mapping-confirm and arms nothing until Approve restores the previous controls', () => {
    const h = withPreviousMapping();
    const current = JSON.stringify(h.snap.mapping);
    say(h, 'change-controls');
    raw(h, 'use-previous');
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(JSON.stringify(h.snap.mapping)).toBe(current);
    expect(h.snap.pendingMapping).not.toBeNull();
    h.session.decide('approve-mapping');
    expect(h.snap.stage).toBe('communication');
    expect(JSON.stringify(h.snap.mapping)).not.toBe(current);
  });

  it('P4 is not offered in communication, in a first setup or while a movement is being added', () => {
    const h = withPreviousMapping();
    expect(ids(h)).not.toContain('use-previous');
    raw(h, 'use-previous');
    expect(h.snap.stage).toBe('communication');
    raw(h, 'more');
    expect(ids(h)).not.toContain('use-previous');
    const first = ready();
    say(first, 'change-controls');
    expect(first.snap.decisions.map((decision) => decision.id)).not.toContain('use-previous');
    // A candidate (adding) with an earlier mapping on record: Change-controls-style cards but no use-previous.
    const adding = withPreviousMapping();
    say(adding, 'add-movement');
    adding.session.chooseMovement({ feature: 'mouthPucker', direction: 1, label: 'Pucker lips' });
    adding.followPrompts((s) => s.stage === 'negative' || s.stage === 'setup-failed', (s) => (s.capture?.movement === 'Pucker lips' ? { mouthPucker: 0.7 } : perform(s.capture?.movement ?? null)));
    adding.run(11_000, HEAD_WOBBLE);
    expect(adding.snap.stage).toBe('comfort');
    adding.session.decide('choose-different');
    expect(adding.snap.stage).toBe('mapping');
    expect(adding.snap.decisions.map((decision) => decision.id)).not.toContain('use-previous');
  });

  it('P4 an invalid previous mapping is not offered', () => {
    const h = withPreviousMapping();
    (h.session as unknown as { previousMapping: unknown }).previousMapping = { assignments: { nothing: 'select' }, mode: 'auto' };
    say(h, 'change-controls');
    expect(h.snap.decisions.map((decision) => decision.id)).not.toContain('use-previous');
    raw(h, 'use-previous');
    expect(h.snap.stage).toBe('mapping');
  });
});

describe('P5 use counting continues in communication', () => {
  it('P5 approval counts nothing; a completed hold and a released hold count on the board', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable');
    expect(use(h, BROW_LABEL)).toEqual({ completed: 0, unfinished: 0 });
    h.selectByGesture('phrase:g1:0'); // a group tile, then the phrase: two completed holds
    expect(use(h, BROW_LABEL)).toEqual({ completed: 2, unfinished: 0 });
    h.run(2_000, REST);
    h.run(150, BROW); // released before the dwell completes
    h.run(2_000, REST);
    expect(use(h, BROW_LABEL).unfinished).toBe(1);
    expect(use(h, BROW_LABEL).completed).toBe(2);
  });
});

describe('P7 Play', () => {
  it('P7 the speak control is labelled Play in every list that has it, and no label says Speak', () => {
    for (const h of [ready(), (() => { const a = new Harness(); a.session.useAssisted(); return a; })()]) {
      expect(h.snap.scan!.targets.find((target) => target.id === 'speak')!.label).toBe('Play');
      expect(labels(h).join(' ')).not.toMatch(/\bSpeak\b/);
      raw(h, 'more');
      expect(labels(h).join(' ')).not.toMatch(/\bSpeak\b/);
    }
  });

  it('P7 behaviour is unchanged: the message moves to Last spoken and the speech port is called', () => {
    const h = ready();
    say(h, PH[0], PH[1], 'speak');
    expect(h.spoken).toEqual(['Yes. No']);
    expect(h.snap.message).toEqual([]);
    expect(h.snap.lastSpoken).toBe('Yes. No');
  });

  it('P7 an empty message announces there is nothing to play, and says nothing else', () => {
    const h = ready();
    raw(h, 'speak');
    expect(h.snap.announcement).toMatch(/Nothing to play/i);
    expect(h.snap.announcement).not.toMatch(/speak/i);
    expect(h.spoken).toEqual([]);
    expect(h.snap.lastSpoken).toBeNull();
  });

  it('P7 no announcement or hint produced on the board mentions Speak as a button', () => {
    const h = ready();
    const seen: string[] = [h.snap.announcement];
    say(h, PH[0]); seen.push(h.snap.announcement);
    say(h, 'undo'); seen.push(h.snap.announcement);
    raw(h, 'speak'); seen.push(h.snap.announcement);
    say(h, PH[1], 'speak', 'say-again'); seen.push(h.snap.announcement);
    expect(seen.join(' | ')).not.toMatch(/Select Speak|\bSpeak\b button|"Speak"/);
  });
});
