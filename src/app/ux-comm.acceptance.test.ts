import { describe, expect, it } from 'vitest';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY } from './profiles';
import { BROW, Harness, MOUTH, REST, type Values } from './session.test-support';

// Branch ux-comm-screen, session-level criteria C1-C9, C14, C15 (UX_ACCEPTANCE.md; design: reasoning.md "UX comm screen", revision 2).
// Targets the contracts: ids speak/undo/repeat/helper/close-helper/clear/clear-yes/clear-no/phrase:N and the
// snapshot fields helperOpen, confirmingClear and movementSeen.

const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const perform = (label: string | null): Values => (label === 'Open mouth' ? MOUTH : label ? BROW : REST);
const PHRASES = [0, 1, 2, 3, 4, 5].map((i) => `phrase:${i}`);
const DEFAULT_PHRASES = ['Yes', 'No', 'I need water', 'Please help me', 'I am uncomfortable', 'Thank you'];

type Snap = Harness['snap'] & { helperOpen: boolean; confirmingClear: boolean; movementSeen: boolean };
const snap = (h: Harness) => h.snap as Snap;
const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);
const say = (h: Harness, ...list: string[]) => { for (const id of list) h.session.selectTarget(id); };

/** Gesture mode, one movement approved, practice finished: the communication screen. */
function ready(options: ConstructorParameters<typeof Harness>[0] = {}): Harness {
  const h = new Harness(options);
  h.setUpToCommunication();
  expect(h.snap.stage).toBe('communication');
  return h;
}
/** Two movements (brow selects, mouth moves next): step scanning, so Tiring is offered. */
function ready2(): Harness {
  const h = ready();
  h.addMovement(OPEN_MOUTH, perform);
  h.selectByGesture('comfortable');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  h.stepTo('finish-practice');
  expect(h.snap.stage).toBe('communication');
  return h;
}
/** Assisted Space mode with no movement set up. */
function assisted(): Harness {
  const h = new Harness();
  h.session.useAssisted();
  expect(h.snap.stage).toBe('communication');
  return h;
}
/** Assisted selection of `id`: let the highlight reach it, then press Space. */
function press(h: Harness, id: string): void {
  for (let guard = 0; h.highlightedId() !== id; guard += 1) {
    if (guard > 400) throw new Error(`highlight never reached ${id}`);
    h.stall(100);
  }
  h.session.switchPress(h.now);
}

describe('C1 scan order', () => {
  it('C1 empty message: six phrases, pause, helper (no repeat before anything was spoken); no other control', () => {
    expect(ids(ready())).toEqual([...PHRASES, 'pause', 'helper']);
  });

  it('C1 with a message: speak, undo, the six phrases, pause, helper', () => {
    const h = ready();
    say(h, 'phrase:0');
    expect(ids(h)).toEqual(['speak', 'undo', ...PHRASES, 'pause', 'helper']);
  });

  it('C1 after something was spoken and the message is empty, repeat follows the phrases', () => {
    const h = ready();
    say(h, 'phrase:0', 'speak');
    expect(ids(h)).toEqual([...PHRASES, 'repeat', 'pause', 'helper']);
  });

  it('C1 the same lists hold in assisted mode', () => {
    const h = assisted();
    expect(ids(h)).toEqual([...PHRASES, 'pause', 'helper']);
    press(h, 'phrase:1');
    expect(ids(h)).toEqual(['speak', 'undo', ...PHRASES, 'pause', 'helper']);
    press(h, 'speak');
    expect(ids(h)).toEqual([...PHRASES, 'repeat', 'pause', 'helper']);
  });
});

describe('C2 selections to speak, highlight resets', () => {
  it('C2 "Please help me" is spoken in 2 gesture selections and the highlight returns to the first item each time', () => {
    const h = ready();
    let selections = 0;
    h.selectByGesture('phrase:3'); selections += 1;
    expect(h.snap.message).toEqual(['Please help me']);
    expect(h.highlightedId()).toBe(ids(h)[0]);
    h.selectByGesture('speak'); selections += 1;
    expect(h.spoken).toEqual(['Please help me']);
    expect(h.highlightedId()).toBe(ids(h)[0]);
    expect(selections).toBe(2);
  });

  it('C2 a five-phrase message is spoken in 6 selections', () => {
    const h = ready();
    let selections = 0;
    for (const id of ['phrase:0', 'phrase:1', 'phrase:2', 'phrase:3', 'phrase:4']) {
      h.selectByGesture(id); selections += 1;
      expect(h.highlightedId()).toBe(ids(h)[0]);
    }
    h.selectByGesture('speak'); selections += 1;
    expect(selections).toBe(6);
    expect(h.spoken).toEqual(['Yes. No. I need water. Please help me. I am uncomfortable']);
    expect(h.highlightedId()).toBe(ids(h)[0]);
  });

  it('C2 assisted selections also restart the highlight at the first item', () => {
    const h = assisted();
    press(h, 'phrase:2');
    expect(h.highlightedId()).toBe('speak');
    press(h, 'speak');
    expect(h.highlightedId()).toBe('phrase:0');
  });
});

describe('C3 Undo', () => {
  it('C3 removes only the last phrase and is not offered with an empty message', () => {
    const h = ready();
    expect(ids(h)).not.toContain('undo');
    h.session.selectTarget('undo');
    expect(h.snap.message).toEqual([]);
    say(h, 'phrase:0', 'phrase:1', 'phrase:2');
    say(h, 'undo');
    expect(h.snap.message).toEqual(['Yes', 'No']);
    say(h, 'undo', 'undo');
    expect(h.snap.message).toEqual([]);
    expect(ids(h)).not.toContain('undo');
  });

  it('C3 never changes lastSpoken, scan speed, mapping or phrases', () => {
    const h = ready();
    say(h, 'phrase:1', 'speak', 'phrase:0', 'phrase:2');
    const before = { last: h.snap.lastSpoken, ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, phrases: h.snap.phrases };
    say(h, 'undo');
    expect(h.snap.message).toEqual(['Yes']);
    expect({ last: h.snap.lastSpoken, ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, phrases: h.snap.phrases }).toEqual(before);
    expect(h.spoken).toEqual(['No']);
  });
});

describe('C4 Say it again', () => {
  it('C4 is absent until something is spoken, then speaks exactly the last text and leaves the message alone', () => {
    const h = ready();
    expect(ids(h)).not.toContain('repeat');
    h.session.selectTarget('repeat');
    expect(h.spoken).toEqual([]);
    say(h, 'phrase:0', 'phrase:1', 'speak');
    expect(h.spoken).toEqual(['Yes. No']);
    say(h, 'repeat');
    expect(h.spoken).toEqual(['Yes. No', 'Yes. No']);
    expect(h.snap.message).toEqual([]);
    expect(h.snap.lastSpoken).toBe('Yes. No');
  });

  it('C4 still speaks the last text after Clear and is not offered while a message is being built', () => {
    const h = ready();
    say(h, 'phrase:0', 'speak', 'phrase:1');
    expect(ids(h)).not.toContain('repeat');
    say(h, 'helper', 'clear', 'clear-yes');
    expect(h.snap.message).toEqual([]);
    expect(ids(h)).toContain('repeat');
    say(h, 'repeat');
    expect(h.spoken).toEqual(['Yes', 'Yes']);
    expect(h.snap.message).toEqual([]);
  });

  it('C4 works in assisted mode', () => {
    const h = assisted();
    press(h, 'phrase:3');
    press(h, 'speak');
    press(h, 'repeat');
    expect(h.spoken).toEqual(['Please help me', 'Please help me']);
  });
});

describe('C5 Clear confirmation', () => {
  it('C5 Clear is only in the Helper panel and only with a message', () => {
    const h = ready();
    expect(ids(h)).not.toContain('clear');
    say(h, 'helper');
    expect(ids(h)).not.toContain('clear');
    say(h, 'close-helper', 'phrase:0');
    expect(ids(h)).not.toContain('clear');
    say(h, 'helper');
    expect(ids(h)).toContain('clear');
  });

  it('C5 selecting Clear offers Keep it first, then Yes; Keep it leaves the message, Yes empties it', () => {
    const h = ready();
    say(h, 'phrase:0', 'phrase:1', 'helper', 'clear');
    expect(snap(h).confirmingClear).toBe(true);
    expect(ids(h)).toEqual(['clear-no', 'clear-yes']);
    expect(h.snap.message).toEqual(['Yes', 'No']);
    say(h, 'clear-no');
    expect(snap(h).confirmingClear).toBe(false);
    expect(h.snap.message).toEqual(['Yes', 'No']);
    expect(ids(h)).toEqual(['speak', 'undo', ...PHRASES, 'pause', 'helper']);
    say(h, 'helper', 'clear', 'clear-yes');
    expect(h.snap.message).toEqual([]);
    expect(snap(h).confirmingClear).toBe(false);
    expect(ids(h)).toEqual([...PHRASES, 'pause', 'helper']);
  });

  it('C5 with the confirmation open, five minutes of scanner ticks discard nothing', () => {
    const h = ready();
    say(h, 'phrase:0', 'phrase:1', 'helper', 'clear');
    h.run(300_000, REST);
    expect(snap(h).confirmingClear).toBe(true);
    expect(h.snap.message).toEqual(['Yes', 'No']);
    h.stall(300_000);
    expect(snap(h).confirmingClear).toBe(true);
    expect(h.snap.message).toEqual(['Yes', 'No']);
  });

  it('C5 other ids cannot reach the confirmation or clear without it (clear-yes while closed does nothing)', () => {
    const h = ready();
    say(h, 'phrase:0', 'clear-yes', 'clear-no', 'clear');
    expect(h.snap.message).toEqual(['Yes']);
    expect(snap(h).confirmingClear).toBe(false);
  });
});

describe('C6 Helper panel', () => {
  it('C6 gesture panel with a message: close-helper, the controls, slower/faster, clear, practice, pause', () => {
    const h = ready();
    say(h, 'phrase:0', 'helper');
    expect(snap(h).helperOpen).toBe(true);
    expect(ids(h)).toEqual(['close-helper', 'change-controls', 'add-movement', 'recalibrate', 'slower', 'faster', 'clear', 'practice', 'pause']);
  });

  it('C6 without a message there is no clear', () => {
    const h = ready();
    say(h, 'helper');
    expect(ids(h)).toEqual(['close-helper', 'change-controls', 'add-movement', 'recalibrate', 'slower', 'faster', 'practice', 'pause']);
  });

  it('C6 with two movements Tiring is offered and, in step scanning, there is no slower/faster', () => {
    const h = ready2();
    expect(h.snap.scanMode).toBe('step');
    say(h, 'helper');
    const list = ids(h);
    expect(list[0]).toBe('close-helper');
    expect(list).toEqual(expect.arrayContaining(['change-controls', 'add-movement', 'recalibrate', 'tiring', 'practice', 'pause']));
    expect(list).not.toContain('slower');
    expect(list).not.toContain('faster');
    expect(list[list.length - 1]).toBe('pause');
    expect(list.indexOf('tiring')).toBeLessThan(list.indexOf('practice'));
  });

  it('C6 the assisted panel offers a movement setup choice instead of the gesture controls', () => {
    const h = assisted();
    press(h, 'helper');
    const list = ids(h);
    expect(list[0]).toBe('close-helper');
    expect(list).toContain('setup-gesture');
    expect(list.indexOf('setup-gesture')).toBeLessThan(list.indexOf('slower'));
    expect(list).toEqual(expect.arrayContaining(['slower', 'faster', 'practice', 'pause']));
    for (const gone of ['change-controls', 'add-movement', 'recalibrate', 'tiring']) expect(list).not.toContain(gone);
    expect(list[list.length - 1]).toBe('pause');
  });

  it('C6 opening and closing changes no setting, and Close returns to the main list', () => {
    const h = ready();
    say(h, 'phrase:2');
    const before = { ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, phrases: h.snap.phrases, message: h.snap.message, last: h.snap.lastSpoken };
    const list = ids(h);
    say(h, 'helper');
    say(h, 'close-helper');
    expect(snap(h).helperOpen).toBe(false);
    expect(ids(h)).toEqual(list);
    expect({ ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, phrases: h.snap.phrases, message: h.snap.message, last: h.snap.lastSpoken }).toEqual(before);
  });

  it('C6 Slower and Faster change the speed and keep the panel open', () => {
    const h = ready();
    const start = h.snap.scan!.intervalMs;
    say(h, 'helper', 'slower');
    expect(snap(h).helperOpen).toBe(true);
    expect(ids(h)[0]).toBe('close-helper');
    expect(h.snap.scan!.intervalMs).toBe(start + 500);
    say(h, 'faster', 'faster');
    expect(snap(h).helperOpen).toBe(true);
    expect(h.snap.scan!.intervalMs).toBe(start - 500);
  });
});

describe('C7 helper ids need the panel', () => {
  const panelOnly = ['change-controls', 'add-movement', 'recalibrate', 'tiring', 'practice', 'slower', 'faster', 'clear', 'close-helper', 'clear-yes', 'clear-no', 'use-gesture', 'setup-gesture'];

  it('C7 a helper id selected while the panel is closed does nothing', () => {
    const h = ready2();
    say(h, 'phrase:0');
    const before = JSON.stringify({ stage: h.snap.stage, ms: h.snap.scan!.intervalMs, message: h.snap.message, mapping: h.snap.mapping, open: snap(h).helperOpen, conf: snap(h).confirmingClear });
    for (const id of panelOnly) say(h, id);
    expect(JSON.stringify({ stage: h.snap.stage, ms: h.snap.scan!.intervalMs, message: h.snap.message, mapping: h.snap.mapping, open: snap(h).helperOpen, conf: snap(h).confirmingClear })).toBe(before);
  });

  it('C7 from the panel, each existing control still does what it did', () => {
    const cases: Array<[string, () => Harness, (h: Harness) => void]> = [
      ['change-controls', () => ready(), (h) => expect(h.snap.stage).toBe('mapping')],
      ['add-movement', () => ready(), (h) => { expect(h.snap.stage).toBe('choose'); expect(h.snap.adding).toBe(true); }],
      ['recalibrate', () => ready(), (h) => expect(h.snap.stage).toBe('recalibrate-confirm')],
      ['tiring', () => ready2(), (h) => expect(h.snap.stage).toBe('tiring')],
      ['practice', () => ready(), (h) => expect(h.snap.stage).toBe('practice')],
    ];
    for (const [id, make, check] of cases) {
      const h = make();
      say(h, 'helper', id);
      check(h);
    }
  });
});

describe('C8 Pause and list changes', () => {
  it('C8 Pause from the board stops the highlight and keeps the message', () => {
    const h = ready();
    say(h, 'phrase:0', 'pause');
    expect(h.snap.scan!.paused).toBe(true);
    const at = h.highlightedId();
    h.run(10_000, REST);
    expect(h.highlightedId()).toBe(at);
    expect(h.snap.message).toEqual(['Yes']);
  });

  it('C8 Pause from the panel keeps the panel open and the message', () => {
    const h = ready();
    say(h, 'phrase:0', 'helper', 'pause');
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
    press(a, 'pause');
    expect(a.snap.scan!.paused).toBe(true);
    a.session.switchPress(a.now);
    expect(a.snap.scan!.paused).toBe(false);
  });

  it('C8 message and panel state survive Pause and tracking loss', () => {
    const h = ready();
    say(h, 'phrase:0', 'helper');
    for (let i = 0; i < 20; i += 1) h.step(REST, 'missing');
    expect(h.snap.message).toEqual(['Yes']);
    expect(snap(h).helperOpen).toBe(true);
    h.run(2_000, REST);
    say(h, 'pause');
    h.run(5_000, REST);
    expect(h.snap.message).toEqual(['Yes']);
    expect(snap(h).helperOpen).toBe(true);
  });

  it('C8 the step-idle fallback keeps the panel and the message', () => {
    const h = ready2();
    say(h, 'phrase:0', 'helper');
    h.run(61_000, REST);
    expect(h.snap.stepFallback).toBe(true);
    expect(snap(h).helperOpen).toBe(true);
    expect(h.snap.message).toEqual(['Yes']);
    expect(ids(h)[0]).toBe('close-helper');
  });

  it('C8 a hold that began before the list changed selects nothing', () => {
    const h = ready();
    h.run(1_500, REST);
    h.run(150, BROW); // hold begun on the board (shorter than the 250 ms dwell)
    expect(h.snap.scan!.latched).not.toBeNull();
    say(h, 'helper'); // list swaps under the hold
    expect(snap(h).helperOpen).toBe(true);
    h.run(800, BROW);
    h.run(1_500, REST);
    expect(snap(h).helperOpen).toBe(true);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.message).toEqual([]);
    expect(ids(h)[0]).toBe('close-helper');
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

  it('C9 the same holds in practice', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable', BROW, 60_000, 600, 200);
    expect(h.snap.stage).toBe('practice');
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
    press(h, 'phrase:0');
    h.session.refresh();
    expect(snap(h).movementSeen).toBe(false);
  });
});

describe('C14 privacy', () => {
  it('C14 the saved profile never contains the message, lastSpoken or panel state', () => {
    const storage = createMemoryStorage();
    const h = ready({ profiles: createLocalProfileStore(() => storage) });
    say(h, 'phrase:3', 'phrase:4', 'speak', 'phrase:2', 'helper', 'slower');
    expect(snap(h).helperOpen).toBe(true);
    const raw = storage.data.get(PROFILE_KEY)!;
    expect(raw).toBeTruthy();
    for (const text of ['Please help me. I am uncomfortable', 'lastSpoken', '"message"', 'helperOpen', 'confirmingClear', 'movementSeen']) expect(raw).not.toContain(text);
    const profile = JSON.parse(raw).profiles[0];
    expect(Object.keys(profile).sort()).toEqual(expect.not.arrayContaining(['message', 'lastSpoken', 'helperOpen']));
    expect(profile.phrases).toEqual(DEFAULT_PHRASES);
  });
});

describe('C15 Speak and list integrity', () => {
  it('C15 Speak moves the message to lastSpoken and empties it', () => {
    const h = ready();
    say(h, 'phrase:0', 'phrase:1', 'speak');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.lastSpoken).toBe('Yes. No');
    expect(h.spoken).toEqual(['Yes. No']);
  });

  it('C15 without a local voice the text still moves to lastSpoken and the message empties', () => {
    const h = ready();
    h.speechAvailable = false;
    say(h, 'phrase:0', 'speak');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.lastSpoken).toBe('Yes');
    expect(h.spoken).toEqual([]);
  });

  it('C15 Speak with an empty message changes nothing', () => {
    const h = ready();
    h.session.selectTarget('speak');
    expect(h.snap.lastSpoken).toBeNull();
    expect(h.spoken).toEqual([]);
  });

  it('C15 Change controls from the panel keeps the mapping decisions in the scan list', () => {
    const h = ready();
    say(h, 'helper', 'change-controls');
    expect(h.snap.stage).toBe('mapping');
    const list = ids(h);
    expect(list.some((id) => id.startsWith('map:'))).toBe(true);
    for (const wrong of ['speak', 'phrase:0', 'helper', 'close-helper', 'pause']) expect(list).not.toContain(wrong);
    expect(h.snap.decisions.map((d) => d.id)).toEqual(expect.arrayContaining(list.filter((id) => id.startsWith('map:'))));
  });

  it('C15 add-movement, recalibrate and practice keep their own scan lists', () => {
    const add = ready();
    say(add, 'helper', 'add-movement');
    expect(add.snap.stage).toBe('choose');
    expect(ids(add)).not.toContain('phrase:0');
    const recal = ready();
    say(recal, 'helper', 'recalibrate');
    expect(ids(recal)).toEqual(expect.arrayContaining(['start-recalibration', 'keep-current']));
    expect(ids(recal)).not.toContain('phrase:0');
    const practice = ready();
    say(practice, 'helper', 'practice');
    expect(practice.snap.stage).toBe('practice');
    expect(ids(practice)).toContain('finish-practice');
    expect(snap(practice).helperOpen).toBe(false);
  });
});
