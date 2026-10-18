import { describe, expect, it } from 'vitest';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY } from './profiles';
import { BROW, Harness, MOUTH, REST, type Values } from './session.test-support';

// Communication-screen criteria (C1-C9, C14, C15), updated to the merged contract (R18): the top list is static, phrases live in
// groups (`phrase:<group>:<n>`), Helper is the scan id `more` (closed by `back`), `say-again` replaces `repeat`, and Clear and
// Recalibrate open confirm levels.

const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const perform = (label: string | null): Values => (label === 'Open mouth' ? MOUTH : label ? BROW : REST);
/** The six starter phrases in the old flat order: Yes, No, I need water, Please help me, I am uncomfortable, Thank you. */
const PH = ['phrase:g1:0', 'phrase:g1:1', 'phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2', 'phrase:g1:2'];
const GROUPS = ['group:favourites', 'group:g1', 'group:g2'];
const TOP = ['speak', 'undo', ...GROUPS, 'pause', 'more'];
const MORE_GESTURE = ['clear', 'save-favourite', 'say-again', 'slower', 'faster', 'change-controls', 'add-movement', 'recalibrate', 'back', 'pause'];

type Snap = Harness['snap'] & { helperOpen: boolean; confirmingClear: boolean; confirmingRecalibrate: boolean; movementSeen: boolean };
const snap = (h: Harness) => h.snap as Snap;
const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);
/** Helper clicks: opens the level that holds each id first, as a helper would. */
const say = (h: Harness, ...list: string[]) => { for (const id of list) h.click(id); };
/** A direct selection of an id as it is: refused unless it is in the current list. */
const raw = (h: Harness, ...list: string[]) => { for (const id of list) h.session.selectTarget(id); };

function ready(options: ConstructorParameters<typeof Harness>[0] = {}): Harness {
  const h = new Harness(options);
  h.setUpToCommunication();
  expect(h.snap.stage).toBe('communication');
  return h;
}
/** Two movements (brow selects, mouth moves next): step scanning. */
function ready2(): Harness {
  const h = ready();
  h.addMovement(OPEN_MOUTH, perform);
  h.selectByGesture('choose-different');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  expect(h.snap.stage).toBe('communication');
  return h;
}
function assisted(): Harness {
  const h = new Harness();
  h.session.useAssisted();
  expect(h.snap.stage).toBe('communication');
  return h;
}

describe('C1 stable lists', () => {
  it('C1 the top list is the same with an empty message, a message and after speaking', () => {
    const h = ready();
    expect(ids(h)).toEqual(TOP);
    say(h, PH[0]);
    expect(ids(h)).toEqual(TOP);
    say(h, 'speak');
    expect(ids(h)).toEqual(TOP);
  });

  it('C1 a group list is its phrases, back and pause', () => {
    const h = ready();
    raw(h, 'group:g1');
    expect(ids(h)).toEqual(['phrase:g1:0', 'phrase:g1:1', 'phrase:g1:2', 'back', 'pause']);
  });

  it('C1 the same lists hold in assisted mode', () => {
    const h = assisted();
    expect(ids(h)).toEqual(TOP);
    h.switchTo(PH[1]);
    expect(ids(h)).toEqual(TOP);
    h.switchTo('speak');
    expect(ids(h)).toEqual(TOP);
  });
});

describe('C2 selections to speak, highlight resets', () => {
  it('C2 "Please help me" is spoken in 3 gesture selections (group, phrase, Play) and the highlight returns to Play', () => {
    const h = ready();
    let selections = 0;
    h.selectByGesture('group:g2'); selections += 1;
    expect(ids(h)).toContain(PH[3]);
    h.selectByGesture(PH[3]); selections += 1;
    expect(h.snap.message).toEqual(['Please help me']);
    expect(h.highlightedId()).toBe('speak');
    h.selectByGesture('speak'); selections += 1;
    expect(h.spoken).toEqual(['Please help me']);
    expect(selections).toBe(3);
    expect(h.highlightedId()).toBe('speak');
  });

  it('C2 a five-phrase message is spoken in 11 selections (a group and a phrase each, then Play)', () => {
    const h = ready();
    let selections = 0;
    for (const id of PH.slice(0, 5)) {
      h.selectByGesture(`group:${id.split(':')[1]}`); selections += 1;
      h.selectByGesture(id); selections += 1;
      expect(h.highlightedId()).toBe('speak');
    }
    h.selectByGesture('speak'); selections += 1;
    expect(selections).toBe(11);
    expect(h.spoken).toEqual(['Yes. No. I need water. Please help me. I am uncomfortable']);
  });

  it('C2 assisted selections restart the highlight at the first item too', () => {
    const h = assisted();
    h.switchTo(PH[2]);
    expect(h.highlightedId()).toBe('speak');
    h.switchTo('speak');
    expect(h.highlightedId()).toBe('speak');
  });
});

describe('C3 Undo', () => {
  it('C3 is always in the list, does nothing on an empty message and removes only the last phrase', () => {
    const h = ready();
    expect(ids(h)).toContain('undo');
    raw(h, 'undo');
    expect(h.snap.message).toEqual([]);
    say(h, PH[0], PH[1], PH[2]);
    say(h, 'undo');
    expect(h.snap.message).toEqual(['Yes', 'No']);
    say(h, 'undo', 'undo', 'undo');
    expect(h.snap.message).toEqual([]);
    expect(ids(h)).toContain('undo');
  });

  it('C3 never changes lastSpoken, scan speed, mapping or phrases', () => {
    const h = ready();
    say(h, PH[1], 'speak', PH[0], PH[2]);
    const before = { last: h.snap.lastSpoken, ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, vocabulary: h.snap.vocabulary };
    say(h, 'undo');
    expect(h.snap.message).toEqual(['Yes']);
    expect({ last: h.snap.lastSpoken, ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, vocabulary: h.snap.vocabulary }).toEqual(before);
    expect(h.spoken).toEqual(['No']);
  });
});

describe('C4 Say it again', () => {
  it('C4 is a Helper-level target, absent from the top list and does nothing before anything was spoken', () => {
    const h = ready();
    expect(ids(h)).not.toContain('say-again');
    raw(h, 'say-again');
    say(h, 'more');
    expect(ids(h)).toContain('say-again');
    raw(h, 'say-again');
    expect(h.spoken).toEqual([]);
  });

  it('C4 speaks exactly the last text and leaves the message and everything else alone', () => {
    const h = ready();
    say(h, PH[0], PH[1], 'speak', 'more');
    expect(h.spoken).toEqual(['Yes. No']);
    const before = JSON.stringify({ ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, message: h.snap.message });
    raw(h, 'say-again');
    expect(h.spoken).toEqual(['Yes. No', 'Yes. No']);
    expect(h.snap.lastSpoken).toBe('Yes. No');
    expect(JSON.stringify({ ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, message: h.snap.message })).toBe(before);
  });

  it('C4 still speaks the last text after Clear', () => {
    const h = ready();
    say(h, PH[0], 'speak', PH[1], 'clear', 'clear-yes');
    expect(h.snap.message).toEqual([]);
    say(h, 'say-again');
    expect(h.spoken).toEqual(['Yes', 'Yes']);
    expect(h.snap.message).toEqual([]);
  });

  it('C4 works in assisted mode', () => {
    const h = assisted();
    h.switchTo(PH[3]);
    h.switchTo('speak');
    h.switchTo('say-again');
    expect(h.spoken).toEqual(['Please help me', 'Please help me']);
  });
});

describe('C5 Clear confirmation', () => {
  it('C5 Clear is only in the Helper level', () => {
    const h = ready();
    expect(ids(h)).not.toContain('clear');
    raw(h, 'clear');
    expect(snap(h).confirmingClear).toBe(false);
    say(h, PH[0]);
    expect(ids(h)).not.toContain('clear');
    raw(h, 'more');
    expect(ids(h)).toContain('clear');
  });

  it('C5 selecting Clear opens clear-no, clear-yes, pause; Keep it keeps the message, Yes empties it', () => {
    const h = ready();
    say(h, PH[0], PH[1], 'clear');
    expect(snap(h).confirmingClear).toBe(true);
    expect(h.snap.level?.kind).toBe('clear');
    expect(ids(h)).toEqual(['clear-no', 'clear-yes', 'pause']);
    expect(h.snap.message).toEqual(['Yes', 'No']);
    raw(h, 'clear-no');
    expect(snap(h).confirmingClear).toBe(false);
    expect(h.snap.message).toEqual(['Yes', 'No']);
    expect(ids(h)).toEqual(TOP);
    say(h, 'clear', 'clear-yes');
    expect(h.snap.message).toEqual([]);
    expect(snap(h).confirmingClear).toBe(false);
    expect(ids(h)).toEqual(TOP);
  });

  it('C5 left alone, the confirmation returns to the main list after two idle wraps and discards nothing', () => {
    const h = ready();
    say(h, PH[0], PH[1], 'clear');
    h.run(300_000, REST);
    expect(snap(h).confirmingClear).toBe(false);
    expect(ids(h)).toEqual(TOP);
    expect(h.snap.message).toEqual(['Yes', 'No']);
    say(h, 'clear');
    h.stall(300_000);
    expect(h.snap.message).toEqual(['Yes', 'No']);
  });

  it('C5 clear-yes and clear-no do nothing unless the confirmation is open', () => {
    const h = ready();
    say(h, PH[0]);
    raw(h, 'clear-yes', 'clear-no', 'clear');
    expect(h.snap.message).toEqual(['Yes']);
    expect(snap(h).confirmingClear).toBe(false);
  });
});

describe('C6 Helper level', () => {
  it('C6 gesture Helper: clear, save-favourite, say-again, slower, faster, change-controls, add-movement, recalibrate, back, pause', () => {
    const h = ready();
    say(h, PH[0], 'more');
    expect(snap(h).helperOpen).toBe(true);
    expect(h.snap.level?.kind).toBe('more');
    expect(ids(h)).toEqual(MORE_GESTURE);
    expect(h.snap.scan!.targets.find((target) => target.id === 'back')!.label).toBe('Close helper');
  });

  it('C6 the same list with an empty message, and never `tiring`', () => {
    const h = ready();
    say(h, 'more');
    expect(ids(h)).toEqual(MORE_GESTURE);
  });

  it('C6 with two movements Tiring moved into Change controls and, in step scanning, there is no slower/faster', () => {
    const h = ready2();
    expect(h.snap.scanMode).toBe('step');
    say(h, 'more');
    const list = ids(h);
    expect(list).toEqual(['clear', 'save-favourite', 'say-again', 'change-controls', 'add-movement', 'recalibrate', 'back', 'pause']);
    expect(list).not.toContain('tiring');
  });

  it('C6 the assisted Helper offers a movement setup choice instead of the gesture controls', () => {
    const h = assisted();
    h.switchTo('more');
    expect(ids(h)).toEqual(['clear', 'save-favourite', 'say-again', 'slower', 'faster', 'setup-gesture', 'back', 'pause']);
  });

  it('C6 opening and closing the Helper changes no setting, and Close returns to the main list', () => {
    const h = ready();
    say(h, PH[2]);
    const before = { ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, vocabulary: h.snap.vocabulary, message: h.snap.message, last: h.snap.lastSpoken };
    say(h, 'more', 'back');
    expect(snap(h).helperOpen).toBe(false);
    expect(ids(h)).toEqual(TOP);
    expect({ ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, vocabulary: h.snap.vocabulary, message: h.snap.message, last: h.snap.lastSpoken }).toEqual(before);
  });

  it('C6 Slower and Faster change the speed, and a Helper selection returns to the main list as main does', () => {
    const h = ready();
    const start = h.snap.scan!.intervalMs;
    say(h, 'slower');
    expect(h.snap.scan!.intervalMs).toBe(start + 500);
    say(h, 'faster', 'faster');
    expect(h.snap.scan!.intervalMs).toBe(start - 500);
  });
});

describe('C7 ids need their level', () => {
  const levelOnly = ['clear', 'save-favourite', 'say-again', 'slower', 'faster', 'change-controls', 'add-movement', 'recalibrate', 'back',
    'clear-yes', 'clear-no', 'recalibrate-yes', 'recalibrate-no', 'confirm-favourite', 'cancel-favourite', 'use-gesture', 'setup-gesture'];

  it('C7 a Helper id selected from the main list does nothing', () => {
    const h = ready2();
    say(h, PH[0]);
    const read = () => JSON.stringify({ stage: h.snap.stage, ms: h.snap.scan!.intervalMs, message: h.snap.message, mapping: h.snap.mapping, level: h.snap.level, last: h.snap.lastSpoken });
    const before = read();
    raw(h, ...levelOnly);
    expect(read()).toBe(before);
  });

  it('C7 from the Helper, each existing control still does what it did', () => {
    const cases: Array<[string, () => Harness, (h: Harness) => void]> = [
      ['change-controls', () => ready(), (h) => expect(h.snap.stage).toBe('mapping')],
      ['add-movement', () => ready(), (h) => { expect(h.snap.stage).toBe('choose'); expect(h.snap.adding).toBe(true); }],
      ['recalibrate', () => ready(), (h) => { expect(h.snap.stage).toBe('communication'); expect(h.snap.level?.kind).toBe('recalibrate'); }],
    ];
    for (const [id, make, check] of cases) {
      const h = make();
      say(h, id);
      check(h);
    }
  });
});

describe('C8 Pause and list changes', () => {
  it('C8 Pause from the main list stops the highlight and keeps the message', () => {
    const h = ready();
    say(h, PH[0], 'pause');
    expect(h.snap.scan!.paused).toBe(true);
    const at = h.highlightedId();
    h.run(10_000, REST);
    expect(h.highlightedId()).toBe(at);
    expect(h.snap.message).toEqual(['Yes']);
  });

  it('C8 Pause from the Helper level keeps the Helper level and the message', () => {
    const h = ready();
    say(h, PH[0], 'more', 'pause');
    expect(h.snap.scan!.paused).toBe(true);
    expect(snap(h).helperOpen).toBe(true);
    expect(h.snap.message).toEqual(['Yes']);
  });

  it('C8 resumes by the select movement', () => {
    const h = ready();
    say(h, 'pause');
    h.run(1_000, REST);
    h.run(600, BROW);
    h.run(800, REST);
    expect(h.snap.scan!.paused).toBe(false);
  });

  it('C8 resumes by the button and by Space (assisted)', () => {
    const h = ready();
    say(h, 'pause');
    h.session.resume();
    expect(h.snap.scan!.paused).toBe(false);
    const a = assisted();
    a.switchTo('pause');
    expect(a.snap.scan!.paused).toBe(true);
    a.session.switchPress(a.now);
    expect(a.snap.scan!.paused).toBe(false);
  });

  it('C8 message survives Pause and tracking loss', () => {
    const h = ready();
    say(h, PH[0]);
    for (let i = 0; i < 20; i += 1) h.step(REST, 'missing');
    expect(h.snap.message).toEqual(['Yes']);
    h.run(2_000, REST);
    say(h, 'pause');
    h.run(5_000, REST);
    expect(h.snap.message).toEqual(['Yes']);
  });

  it('C8 the step-idle fallback returns to the main list and keeps the message', () => {
    const h = ready2();
    say(h, PH[0], 'more');
    h.run(61_000, REST);
    expect(h.snap.stepFallback).toBe(true);
    expect(h.snap.level?.kind).toBe('top');
    expect(snap(h).helperOpen).toBe(false);
    expect(h.snap.message).toEqual(['Yes']);
    expect(ids(h)).toEqual(TOP);
  });

  it('C8 a hold that began before the list changed selects nothing', () => {
    const h = ready();
    h.run(1_500, REST);
    h.run(150, BROW); // a hold begun on the main list, shorter than the 250 ms dwell
    expect(h.snap.scan!.latched).not.toBeNull();
    raw(h, 'more'); // the list swaps under the hold
    expect(snap(h).helperOpen).toBe(true);
    h.run(800, BROW);
    h.run(1_500, REST);
    expect(h.snap.level?.kind).toBe('more');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.message).toEqual([]);
    expect(ids(h)[0]).toBe('clear');
  });
});

describe('C9 movement seen', () => {
  it('C9 is true within 1 s of a recognised movement in communication and false after 1 s without one', () => {
    const h = ready();
    h.run(1_500, REST);
    h.session.refresh();
    expect(snap(h).movementSeen).toBe(false);
    h.run(600, BROW);
    h.session.refresh();
    expect(snap(h).movementSeen).toBe(true);
    h.run(1_500, REST);
    h.session.refresh();
    expect(snap(h).movementSeen).toBe(false);
  });

  it('C9 the same holds on the board right after approval', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable', BROW, 60_000, 600, 200);
    expect(h.snap.stage).toBe('communication');
    h.run(1_500, REST);
    h.session.refresh();
    expect(snap(h).movementSeen).toBe(false);
    h.run(600, BROW);
    h.session.refresh();
    expect(snap(h).movementSeen).toBe(true);
    h.run(1_500, REST);
    h.session.refresh();
    expect(snap(h).movementSeen).toBe(false);
  });

  it('C9 is always false in assisted mode', () => {
    const h = assisted();
    h.run(1_000, BROW);
    h.session.refresh();
    expect(snap(h).movementSeen).toBe(false);
    h.switchTo(PH[0]);
    h.session.refresh();
    expect(snap(h).movementSeen).toBe(false);
  });
});

describe('C14 privacy', () => {
  it('C14 the saved profile never contains the message, lastSpoken or level state', () => {
    const storage = createMemoryStorage();
    const h = ready({ profiles: createLocalProfileStore(() => storage) });
    say(h, PH[3], PH[4], 'speak', PH[2], 'more', 'slower');
    const raw2 = storage.data.get(PROFILE_KEY)!;
    expect(raw2).toBeTruthy();
    for (const text of ['Please help me. I am uncomfortable', 'lastSpoken', '"message"', 'helperOpen', 'confirmingClear', 'confirmingRecalibrate', 'movementSeen']) expect(raw2).not.toContain(text);
    const profile = JSON.parse(raw2).profiles[0];
    expect(Object.keys(profile)).not.toEqual(expect.arrayContaining(['message']));
    expect(Object.keys(profile)).not.toEqual(expect.arrayContaining(['lastSpoken']));
  });
});

describe('C15 Play and list integrity', () => {
  it('C15 Play moves the message to lastSpoken and empties it', () => {
    const h = ready();
    say(h, PH[0], PH[1], 'speak');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.lastSpoken).toBe('Yes. No');
    expect(h.spoken).toEqual(['Yes. No']);
  });

  it('C15 without a local voice the text still moves to lastSpoken and the message empties', () => {
    const h = ready();
    h.speechAvailable = false;
    say(h, PH[0], 'speak');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.lastSpoken).toBe('Yes');
    expect(h.spoken).toEqual([]);
  });

  it('C15 Play with an empty message changes nothing', () => {
    const h = ready();
    raw(h, 'speak');
    expect(h.snap.lastSpoken).toBeNull();
    expect(h.spoken).toEqual([]);
  });

  it('C15 Change controls from the Helper keeps the mapping decisions in the scan list', () => {
    const h = ready();
    say(h, 'change-controls');
    expect(h.snap.stage).toBe('mapping');
    const list = ids(h);
    expect(list.some((id) => id.startsWith('map:'))).toBe(true);
    for (const wrong of ['speak', 'undo', 'more', 'pause', 'group:g1']) expect(list).not.toContain(wrong);
    expect(h.snap.decisions.map((d) => d.id)).toEqual(expect.arrayContaining(list.filter((id) => id.startsWith('map:'))));
  });

  it('C15 add-movement and recalibrate keep their own scan lists', () => {
    const add = ready();
    say(add, 'add-movement');
    expect(add.snap.stage).toBe('choose');
    expect(ids(add)).not.toContain('speak');
    const recal = ready();
    say(recal, 'recalibrate');
    expect(ids(recal)).toEqual(['recalibrate-no', 'recalibrate-yes', 'pause']);
  });
});
