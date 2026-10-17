import { describe, expect, it } from 'vitest';
import { BROW, Harness, MOUTH, REST, type Values } from './session.test-support';

/** Communication navigation (R14 C1d): levels, Back, Pause everywhere, counted-wrap auto-return, helper shortcuts. */

const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const MOVES: Record<string, Values> = { 'Raise left outer eyebrow': BROW, 'Open mouth': MOUTH };

function ready(): Harness {
  const h = new Harness();
  h.setUpToCommunication();
  expect(h.snap.stage).toBe('communication');
  return h;
}

/** Brow selects, mouth moves next: step mode (no timer). */
function twoGestureStep(): Harness {
  const h = ready();
  h.addMovement(OPEN_MOUTH, (label) => MOVES[label ?? ''] ?? REST);
  h.selectByGesture('comfortable');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  h.stepTo('finish-practice');
  expect(h.snap.scanMode).toBe('step');
  return h;
}

const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);
const levelKind = (h: Harness) => h.snap.level?.kind;
const groupId = (h: Harness) => h.snap.level?.group?.id;

/** Waits for a fresh, armed highlight on `id` (already in the list), then holds the select movement until the session reacts. */
function enterByGesture(h: Harness, id: string, movement: Values = BROW): number {
  let since = h.now;
  let highlighted = h.highlightedId();
  for (let guard = 0; !(highlighted === id && h.snap.runtime?.armed && h.now - since < 1_000); guard += 1) {
    if (guard > 2_000) throw new Error(`no ${id}`);
    h.step(REST);
    if (h.highlightedId() !== highlighted) { highlighted = h.highlightedId(); since = h.now; }
  }
  const state = () => JSON.stringify([h.snap.level, h.snap.scan?.paused, h.snap.scan?.intervalMs, h.snap.announcement]);
  const before = state();
  for (let guard = 0; state() === before; guard += 1) {
    if (guard > 40) throw new Error(`${id} did not act`);
    h.step(movement);
  }
  const at = h.now;
  h.run(600);
  return at;
}

/** Rest (valid tracking, no movement) until `at + ms`. */
function restUntil(h: Harness, at: number, ms: number): void { h.run(at + ms - h.now); }
/** Assisted: let time pass without frames until `at + ms`. */
function waitUntil(h: Harness, at: number, ms: number): void { h.stall(at + ms - h.now); }

describe('one select movement, automatic scanning', () => {
  it('reaches every phrase, Speak, Pause and Recalibrate with select alone', () => {
    const h = ready();
    expect(ids(h)).toEqual(['speak', 'undo', 'group:favourites', 'group:g1', 'group:g2', 'pause', 'more']);
    const phrases = h.snap.vocabulary.groups.flatMap((group) => group.phrases.map((text, index) => [`phrase:${group.id}:${index}`, text] as const));
    for (const [id] of phrases) h.selectByGesture(id);
    expect(h.snap.message).toEqual(phrases.map(([, text]) => text));
    h.selectByGesture('speak');
    expect(h.spoken).toEqual([phrases.map(([, text]) => text).join('. ')]);
    h.selectByGesture('group:g2');
    h.selectByGesture('pause');
    expect(h.snap.scan?.paused).toBe(true);
    expect(groupId(h)).toBe('g2');
    h.run(600, BROW); h.run(600);
    expect(h.snap.scan?.paused).toBe(false);
    // Scan steps to Recalibrate: More is 7th on the main list, Recalibrate 9th inside More.
    h.selectByGesture('back');
    expect(ids(h).indexOf('more')).toBe(6);
    h.selectByGesture('more');
    expect(ids(h).indexOf('recalibrate')).toBe(8);
    h.selectByGesture('recalibrate');
    expect(h.snap.stage).toBe('recalibrate-confirm');
  });

  it('a phrase returns to the main list with Speak highlighted, in one announcement', () => {
    const h = ready();
    h.selectByGesture('group:g2');
    expect(h.snap.announcement).toBe('Needs: 3 phrases.');
    h.selectByGesture('phrase:g2:1');
    expect(h.snap.message).toEqual(['Please help me']);
    expect(levelKind(h)).toBe('top');
    expect(h.snap.announcement).toBe('Added "Please help me". Back to the main list.');
  });

  it('empty Favourites stays on the main list and only announces', () => {
    const h = ready();
    h.selectByGesture('group:favourites');
    expect(levelKind(h)).toBe('top');
    expect(ids(h)[2]).toBe('group:favourites');
    expect(h.snap.announcement).toMatch(/No favourites yet/);
  });

  it('a dwell that spans a scan boundary on a group tile opens that group', () => {
    const h = ready();
    let since = h.now;
    let index = h.snap.scan!.index;
    while (!(h.highlightedId() === 'group:g2' && h.now - since >= 1_850 && h.snap.runtime?.armed)) {
      h.step(REST);
      if (h.snap.scan!.index !== index) { index = h.snap.scan!.index; since = h.now; }
    }
    h.run(200, BROW);
    expect(h.snap.scan?.latched === 'group:g2' || groupId(h) === 'g2').toBe(true);
    h.run(400, BROW); h.run(600);
    expect(groupId(h)).toBe('g2');
    expect(h.snap.message).toEqual([]);
  });

  it('a cancelled dwell on a group tile does nothing', () => {
    const h = ready();
    while (!(h.highlightedId() === 'group:g1' && h.snap.runtime?.armed)) h.step(REST);
    h.run(150, BROW);
    h.run(600);
    expect(levelKind(h)).toBe('top');
    expect(h.snap.message).toEqual([]);
  });

  it('a dwell spanning the would-be second wrap still selects its latched target and does not return', () => {
    const h = ready();
    const at = enterByGesture(h, 'group:g1');
    // Five targets at 2 s: the highlight wraps at about 10 s and would return at about 20 s.
    restUntil(h, at, 18_200);
    expect(h.highlightedId()).toBe('pause');
    h.run(1_800, BROW);
    h.run(600);
    expect(h.snap.scan?.paused).toBe(true);
    expect(groupId(h)).toBe('g1');
  });
});

describe('auto-return after two counted wraps', () => {
  it('gesture automatic scanning: not before the second wrap, then the main list', () => {
    const h = ready();
    const at = enterByGesture(h, 'group:g1');
    restUntil(h, at, 19_700);
    expect(groupId(h)).toBe('g1');
    restUntil(h, at, 20_300);
    expect(levelKind(h)).toBe('top');
    expect(h.highlightedId()).toBe('speak');
    expect(h.snap.announcement).toBe('Back to the main list.');
    expect(h.snap.message).toEqual([]);
  });

  it('assisted Space follows the same rule', () => {
    const h = new Harness();
    h.session.useAssisted();
    h.switchTo('group:g1');
    const at = h.now;
    waitUntil(h, at, 19_700);
    expect(groupId(h)).toBe('g1');
    waitUntil(h, at, 20_300);
    expect(levelKind(h)).toBe('top');
  });

  it('practice follows the same rule and never adds or speaks', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('comfortable');
    h.selectByGesture('map:0');
    h.selectByGesture('approve-mapping');
    expect(h.snap.stage).toBe('practice');
    expect(ids(h)).toEqual(['finish-practice', 'group:favourites', 'group:g1', 'group:g2', 'pause']);
    h.selectByGesture('phrase:g2:0');
    expect(h.snap.practice).toEqual({ selections: 1, last: 'I need water' });
    expect(levelKind(h)).toBe('top');
    const at = enterByGesture(h, 'group:g1');
    restUntil(h, at, 19_700);
    expect(groupId(h)).toBe('g1');
    restUntil(h, at, 20_300);
    expect(levelKind(h)).toBe('top');
    h.selectByGesture('pause');
    expect(h.snap.scan?.paused).toBe(true);
    expect(h.snap.message).toEqual([]);
    expect(h.spoken).toEqual([]);
  });

  it('More (11 targets) returns after two full passes', () => {
    const h = ready();
    const at = enterByGesture(h, 'more');
    expect(ids(h)).toHaveLength(11);
    restUntil(h, at, 43_700);
    expect(levelKind(h)).toBe('more');
    restUntil(h, at, 44_300);
    expect(levelKind(h)).toBe('top');
  });

  it('a started dwell resets the count', () => {
    const h = ready();
    const at = enterByGesture(h, 'group:g1');
    restUntil(h, at, 12_000);
    h.run(150, BROW); // dwell starts, then is released: no action
    restUntil(h, at, 25_000);
    expect(groupId(h)).toBe('g1');
    restUntil(h, at, 32_000);
    expect(levelKind(h)).toBe('top');
  });

  it('a scan speed change inside More resets the count and keeps More', () => {
    const h = ready();
    enterByGesture(h, 'more');
    h.run(23_000); // one full pass of More
    const at = enterByGesture(h, 'slower');
    expect(h.snap.scan?.intervalMs).toBe(2_500);
    expect(levelKind(h)).toBe('more');
    // From Slower (4th) the next wrap is 8 × 2.5 s = 20 s away, then a full 27.5 s pass. Without the reset
    // the earlier wrap would already count, and this would return at the 20 s wrap.
    restUntil(h, at, 30_000);
    expect(levelKind(h)).toBe('more');
    restUntil(h, at, 46_500);
    expect(levelKind(h)).toBe('more');
    restUntil(h, at, 48_500);
    expect(levelKind(h)).toBe('top');
  });

  it('pause and resume reset the count; resume keeps the level from its first target', () => {
    const h = ready();
    const at = enterByGesture(h, 'group:g2');
    restUntil(h, at, 18_200);
    expect(h.highlightedId()).toBe('pause');
    enterByGesture(h, 'pause');
    expect(h.snap.scan?.paused).toBe(true);
    h.run(30_000);
    expect(groupId(h)).toBe('g2');
    h.run(600, BROW);
    const resumed = h.now;
    h.run(600);
    expect(h.snap.scan?.paused).toBe(false);
    expect(groupId(h)).toBe('g2');
    expect(h.snap.announcement).toBe('Resumed.');
    restUntil(h, resumed, 15_000);
    expect(groupId(h)).toBe('g2');
    restUntil(h, resumed, 21_500);
    expect(levelKind(h)).toBe('top');
  });

  it('tracking loss inside a group: no action, level kept, count frozen and reset; recovery needs fresh neutral', () => {
    const h = ready();
    const at = enterByGesture(h, 'group:g1');
    restUntil(h, at, 12_000); // one wrap counted
    for (let i = 0; i < 400; i += 1) h.step(BROW, 'missing'); // 20 s with no face
    expect(groupId(h)).toBe('g1');
    expect(h.snap.scan?.suspended).toBe(true);
    h.run(1_000, BROW); // tracking returns mid-movement: not neutral, so nothing acts
    expect(h.snap.message).toEqual([]);
    expect(groupId(h)).toBe('g1');
    const back = h.now;
    restUntil(h, back, 15_000); // without the reset this would already be the second wrap
    expect(groupId(h)).toBe('g1');
    restUntil(h, back, 23_000);
    expect(levelKind(h)).toBe('top');
  });

  it('a helper shortcut starts a fresh count, including right after an auto-return', () => {
    const h = new Harness();
    h.session.useAssisted();
    h.session.openGroup('g1');
    waitUntil(h, h.now, 10_100); // one wrap counted in Quick
    h.session.openGroup('g2');
    let at = h.now;
    waitUntil(h, at, 15_000); // a leftover count would return at the first g2 wrap (10 s)
    expect(groupId(h)).toBe('g2');
    waitUntil(h, at, 20_500);
    expect(levelKind(h)).toBe('top');
    h.session.openGroup('g1'); // just after an auto-return
    at = h.now;
    waitUntil(h, at, 15_000);
    expect(groupId(h)).toBe('g1');
    waitUntil(h, at, 20_500);
    expect(levelKind(h)).toBe('top');
  });

  it('a selection that stays in the level (assisted Say again in More) starts a fresh count', () => {
    const h = new Harness();
    h.session.useAssisted();
    h.switchTo('more');
    expect(ids(h)).toHaveLength(9);
    const at = h.now;
    waitUntil(h, at, 18_100); // one full pass of More counted
    h.switchTo('say-again');
    const pressed = h.now;
    expect(levelKind(h)).toBe('more');
    // From Say again (3rd) the next wrap is 7 × 2 s = 14 s away; a leftover count would return there.
    waitUntil(h, pressed, 20_000);
    expect(levelKind(h)).toBe('more');
    waitUntil(h, pressed, 33_000);
    expect(levelKind(h)).toBe('top');
  });

  it('hiding the tab inside a group resets the count in assisted mode', () => {
    const h = new Harness();
    h.session.useAssisted();
    h.switchTo('group:g1');
    const at = h.now;
    waitUntil(h, at, 10_100); // just after the first wrap
    expect(h.snap.scan?.index).toBe(0);
    h.session.setHidden(true, h.now);
    h.stall(5_000);
    h.session.setHidden(false, h.now);
    const shown = h.now;
    waitUntil(h, shown, 15_000);
    expect(groupId(h)).toBe('g1');
    waitUntil(h, shown, 20_500);
    expect(levelKind(h)).toBe('top');
  });
});

describe('step mode (select + next)', () => {
  it('moves through levels with Next and Select, never selects with Next, and never auto-returns', () => {
    const h = twoGestureStep();
    h.stepTo('group:g1');
    expect(ids(h)).toEqual(['phrase:g1:0', 'phrase:g1:1', 'phrase:g1:2', 'back', 'pause']);
    for (let i = 0; i < 7; i += 1) { h.run(600, MOUTH); h.run(600); }
    expect(h.snap.message).toEqual([]);
    expect(groupId(h)).toBe('g1');
    h.run(40_000); // no timer and no auto-return while stepping
    expect(groupId(h)).toBe('g1');
    h.stepTo('back');
    expect(levelKind(h)).toBe('top');
    h.stepTo('phrase:g2:2');
    expect(h.snap.message).toEqual(['I am uncomfortable']);
  });

  it('the idle fallback from the Favourites confirmation means Cancel', () => {
    const h = twoGestureStep();
    h.stepTo('phrase:g1:0');
    h.stepTo('save-favourite');
    expect(levelKind(h)).toBe('confirm');
    h.run(61_000);
    expect(h.snap.stepFallback).toBe(true);
    expect(levelKind(h)).toBe('top');
    expect(h.snap.announcement).toMatch(/^Not saved\. No movement for a minute/);
    expect(h.snap.vocabulary.groups[0]!.phrases).toEqual([]);
  });

  it('the idle fallback to automatic scanning starts again from the main list', () => {
    const h = twoGestureStep();
    h.stepTo('group:g2');
    h.run(61_000);
    expect(h.snap.stepFallback).toBe(true);
    expect(levelKind(h)).toBe('top');
    expect(h.snap.announcement).toMatch(/starting from the main list/);
  });
});

describe('helper shortcuts and clicks', () => {
  it('opens groups from any level, clicks only targets in the current level, and nothing while paused', () => {
    const h = new Harness();
    h.session.useAssisted();
    h.session.selectTarget('phrase:g1:0'); // not in the main list
    expect(h.snap.message).toEqual([]);
    h.session.openGroup('g1');
    expect(groupId(h)).toBe('g1');
    expect(h.highlightedId()).toBe('phrase:g1:0');
    h.session.selectTarget('phrase:g1:1');
    expect(h.snap.message).toEqual(['No']);
    h.session.selectTarget('more');
    h.session.openGroup('g2');
    expect(groupId(h)).toBe('g2');
    h.session.openGroup('top');
    expect(levelKind(h)).toBe('top');
    h.session.openGroup('favourites'); // empty: announce only
    expect(levelKind(h)).toBe('top');
    h.session.openGroup('g9');
    expect(levelKind(h)).toBe('top');
    h.session.selectTarget('pause');
    expect(h.snap.scan?.paused).toBe(true);
    h.session.openGroup('g2');
    h.session.selectTarget('group:g2');
    expect(levelKind(h)).toBe('top');
    h.session.resume();
    expect(h.snap.scan?.paused).toBe(false);
    h.switchTo('phrase:g2:0');
    expect(h.snap.message).toEqual(['No', 'I need water']);
  });

  it('a helper shortcut during a gesture dwell cancels it with no action', () => {
    const h = ready();
    while (!(h.highlightedId() === 'group:g2' && h.snap.runtime?.armed)) h.step(REST);
    h.run(150, BROW);
    expect(h.snap.scan?.latched).toBe('group:g2');
    h.session.openGroup('g1');
    expect(h.snap.scan?.latched).toBeNull();
    expect(groupId(h)).toBe('g1');
    h.run(800, BROW); // the hold completes, but its latch is gone
    h.run(600);
    expect(groupId(h)).toBe('g1');
    expect(h.snap.message).toEqual([]);
  });

  it('is unavailable outside communication and practice', () => {
    const h = new Harness();
    h.session.openGroup('g1');
    expect(h.snap.level).toBeNull();
    expect(h.snap.stage).toBe('welcome');
  });
});
