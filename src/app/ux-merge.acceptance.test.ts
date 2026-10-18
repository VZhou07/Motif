import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY } from './profiles';
import { BROW, Harness, MOUTH, REST, type Values } from './session.test-support';

// R18 merge of main into ux-simplify: M1-M7, M9 (session level) and M10 (caregiver and secrets). See UX_ACCEPTANCE.md.

const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const perform = (label: string | null): Values => (label === 'Open mouth' ? MOUTH : label ? BROW : REST);
const PH = ['phrase:g1:0', 'phrase:g1:1', 'phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2', 'phrase:g1:2'];
const TOP = ['speak', 'undo', 'group:favourites', 'group:g1', 'group:g2', 'pause', 'more'];
const MORE = ['clear', 'save-favourite', 'say-again', 'slower', 'faster', 'change-controls', 'add-movement', 'recalibrate', 'back', 'pause'];

type Snap = Harness['snap'] & { helperOpen: boolean; confirmingClear: boolean; confirmingRecalibrate: boolean; movementSeen: boolean };
const snap = (h: Harness) => h.snap as Snap;
const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);
const labelOf = (h: Harness, id: string) => h.snap.scan!.targets.find((target) => target.id === id)?.label;
const say = (h: Harness, ...list: string[]) => { for (const id of list) h.click(id); };
const raw = (h: Harness, ...list: string[]) => { for (const id of list) h.session.selectTarget(id); };
const kind = (h: Harness) => h.snap.level?.kind;

function ready(options: ConstructorParameters<typeof Harness>[0] = {}): Harness {
  const h = new Harness(options);
  h.setUpToCommunication();
  expect(h.snap.stage).toBe('communication');
  return h;
}
function ready2(): Harness {
  const h = ready();
  h.addMovement(OPEN_MOUTH, perform);
  h.selectByGesture('choose-different');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  return h;
}
function assisted(): Harness { const h = new Harness(); h.session.useAssisted(); return h; }
/** A message saved to Favourites, then spoken, so Favourites, lastSpoken and a fresh message all exist. */
function withFavourite(h = ready()): Harness {
  say(h, PH[0], PH[1], 'save-favourite', 'confirm-favourite');
  expect(h.snap.vocabulary.groups[0]!.phrases).toEqual(['Yes. No']);
  return h;
}

// ═══ M1 ═══════════════════════════════════════════════════════════════════
describe('M1 top and group lists', () => {
  it('M1 the top list is speak, undo, group tiles, pause, more, whatever the message', () => {
    const h = ready();
    expect(ids(h)).toEqual(TOP);
    say(h, PH[0]);
    expect(ids(h)).toEqual(TOP);
    say(h, 'speak');
    expect(ids(h)).toEqual(TOP);
    expect(labelOf(h, 'more')).toBe('Helper');
  });

  it('M1 a group list is its phrases, back, pause', () => {
    const h = ready();
    raw(h, 'group:g2');
    expect(ids(h)).toEqual(['phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2', 'back', 'pause']);
    expect(labelOf(h, 'back')).toBe('Back');
  });

  it('M1 the lists are the same in assisted mode', () => {
    const h = assisted();
    expect(ids(h)).toEqual(TOP);
    h.switchTo(PH[0]);
    expect(ids(h)).toEqual(TOP);
  });
});

// ═══ M2 ═══════════════════════════════════════════════════════════════════
describe('M2 Helper level', () => {
  it('M2 gesture Helper list, Close helper label, no tiring', () => {
    const h = ready();
    raw(h, 'more');
    expect(ids(h)).toEqual(MORE);
    expect(labelOf(h, 'back')).toBe('Close helper');
    expect(ids(h)).not.toContain('tiring');
  });

  it('M2 below the movement limit Add a movement is offered; with step scanning there is no slower/faster', () => {
    const h = ready2();
    raw(h, 'more');
    expect(ids(h)).toEqual(['clear', 'save-favourite', 'say-again', 'change-controls', 'add-movement', 'recalibrate', 'back', 'pause']);
  });

  it('M2 the assisted Helper has setup-gesture (no approved movement) and use-gesture (one approved)', () => {
    const a = assisted();
    a.switchTo('more');
    expect(ids(a)).toContain('setup-gesture');
    expect(ids(a)).not.toContain('use-gesture');
    const b = ready();
    b.session.useAssisted();
    b.switchTo('more');
    expect(ids(b)).toContain('use-gesture');
    expect(ids(b)).not.toContain('setup-gesture');
    expect(ids(b)).toEqual(['clear', 'save-favourite', 'say-again', 'slower', 'faster', 'use-gesture', 'back', 'pause']);
  });
});

// ═══ M3 ═══════════════════════════════════════════════════════════════════
describe('M3 Clear', () => {
  it('M3 opens clear-no, clear-yes, pause; Keep it keeps the message; Yes empties it', () => {
    const h = ready();
    say(h, PH[0], PH[1], 'clear');
    expect(ids(h)).toEqual(['clear-no', 'clear-yes', 'pause']);
    expect(labelOf(h, 'clear-no')).toBe('Keep it');
    expect(labelOf(h, 'clear-yes')).toBe('Yes, clear it');
    expect(h.highlightedId()).toBe('clear-no');
    raw(h, 'clear-no');
    expect(h.snap.message).toEqual(['Yes', 'No']);
    expect(kind(h)).toBe('top');
    say(h, 'clear', 'clear-yes');
    expect(h.snap.message).toEqual([]);
    expect(kind(h)).toBe('top');
  });

  it('M3 two idle wraps return to the main list with the message kept', () => {
    const h = ready();
    say(h, PH[0], PH[1], 'clear');
    h.run(7_000, REST); // one wrap of the three-item list
    expect(kind(h)).toBe('clear');
    expect(h.snap.message).toEqual(['Yes', 'No']);
    h.run(6_000, REST);
    expect(kind(h)).toBe('top');
    expect(ids(h)).toEqual(TOP);
    expect(h.snap.message).toEqual(['Yes', 'No']);
    expect(h.snap.announcement).toMatch(/Nothing changed/);
    expect(h.snap.announcement).not.toMatch(/Not saved/i);
  });

  it('M3 confirmingClear is true only in the clear level', () => {
    const h = ready();
    say(h, PH[0]);
    expect(snap(h).confirmingClear).toBe(false);
    say(h, 'more');
    expect(snap(h).confirmingClear).toBe(false);
    raw(h, 'clear');
    expect(snap(h).confirmingClear).toBe(true);
    expect(snap(h).helperOpen).toBe(false);
    raw(h, 'clear-no');
    expect(snap(h).confirmingClear).toBe(false);
  });
});

// ═══ M4 ═══════════════════════════════════════════════════════════════════
describe('M4 Recalibrate', () => {
  it('M4 opens recalibrate-no, recalibrate-yes, pause; No returns to the Helper level unchanged', () => {
    const h = ready();
    say(h, PH[0], 'recalibrate');
    expect(ids(h)).toEqual(['recalibrate-no', 'recalibrate-yes', 'pause']);
    expect(labelOf(h, 'recalibrate-no')).toBe('Keep current setup');
    expect(h.highlightedId()).toBe('recalibrate-no');
    const before = JSON.stringify({ ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, models: h.snap.approvedModels, message: h.snap.message });
    raw(h, 'recalibrate-no');
    expect(kind(h)).toBe('more');
    expect(ids(h)).toEqual(MORE);
    expect(h.snap.recalibrating).toBe(false);
    expect(JSON.stringify({ ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, models: h.snap.approvedModels, message: h.snap.message })).toBe(before);
  });

  it('M4 Yes with the camera running starts the rest check', () => {
    const h = ready();
    say(h, 'recalibrate', 'recalibrate-yes');
    expect(h.snap.stage).toBe('baseline');
    expect(h.snap.recalibrating).toBe(true);
  });

  it('M4 Yes with the camera off changes nothing, returns to the Helper level and says why', () => {
    const h = ready();
    say(h, 'recalibrate');
    h.session.setCamera('off');
    raw(h, 'recalibrate-yes');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.recalibrating).toBe(false);
    expect(h.snap.adding).toBe(false);
    expect(kind(h)).toBe('more');
    expect(h.snap.announcement).toMatch(/Start the camera first/i);
    expect(h.snap.approvedModels).toHaveLength(1);
  });

  it('M4 auto-return changes nothing', () => {
    const h = ready();
    say(h, 'recalibrate');
    h.run(13_000, REST);
    expect(kind(h)).toBe('top');
    expect(h.snap.recalibrating).toBe(false);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.announcement).not.toMatch(/Not saved/i);
  });
});

// ═══ M5 ═══════════════════════════════════════════════════════════════════
describe('M5 Speak, Say it again, Undo, counts', () => {
  it('M5 Play moves the message into lastSpoken and empties it, with or without a voice', () => {
    const h = ready();
    say(h, PH[0], PH[1], 'speak');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.lastSpoken).toBe('Yes. No');
    const quiet = ready();
    quiet.speechAvailable = false;
    say(quiet, PH[0], 'speak');
    expect(quiet.snap.message).toEqual([]);
    expect(quiet.snap.lastSpoken).toBe('Yes');
  });

  it('M5 say-again repeats exactly lastSpoken (also after Clear) and changes nothing else', () => {
    const h = ready();
    say(h, PH[0], 'speak', PH[1], 'clear', 'clear-yes');
    const before = JSON.stringify({ message: h.snap.message, ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, vocabulary: h.snap.vocabulary });
    say(h, 'say-again');
    expect(h.spoken).toEqual(['Yes', 'Yes']);
    expect(h.snap.lastSpoken).toBe('Yes');
    expect(JSON.stringify({ message: h.snap.message, ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, vocabulary: h.snap.vocabulary })).toBe(before);
  });

  it('M5 repeatLast() repeats lastSpoken from any level and changes nothing else', () => {
    const h = ready();
    say(h, PH[1], 'speak');
    for (const level of ['top', 'group:g1', 'more']) {
      if (level === 'top') raw(h, 'pause'), h.session.resume(); // stay at the main list
      else if (level.startsWith('group')) { h.session.openGroup('g1'); } else { h.session.openGroup('top'); raw(h, 'more'); }
      const before = JSON.stringify({ message: h.snap.message, level: h.snap.level, ms: h.snap.scan!.intervalMs });
      const count = h.spoken.length;
      h.session.repeatLast();
      expect([level, h.spoken.length]).toEqual([level, count + 1]);
      expect(h.spoken.at(-1)).toBe('No');
      expect(JSON.stringify({ message: h.snap.message, level: h.snap.level, ms: h.snap.scan!.intervalMs })).toBe(before);
    }
  });

  it('M5 repeatLast() is refused with nothing spoken, and while paused', () => {
    const none = ready();
    none.session.repeatLast();
    expect(none.spoken).toEqual([]);
    const paused = ready();
    say(paused, PH[0], 'speak', 'pause');
    expect(paused.snap.scan!.paused).toBe(true);
    paused.session.repeatLast();
    expect(paused.spoken).toEqual(['Yes']);
  });

  it('M5 Undo removes only the last phrase and nothing else', () => {
    const h = ready();
    say(h, PH[1], 'speak', PH[0], PH[2]);
    const before = { last: h.snap.lastSpoken, ms: h.snap.scan!.intervalMs, vocabulary: h.snap.vocabulary };
    say(h, 'undo');
    expect(h.snap.message).toEqual(['Yes']);
    expect({ last: h.snap.lastSpoken, ms: h.snap.scan!.intervalMs, vocabulary: h.snap.vocabulary }).toEqual(before);
  });

  it('M5 Favourites tile, phrase, Play is 3 selections and the highlight returns to Play after the phrase', () => {
    const h = withFavourite();
    h.selectByGesture('speak');
    h.run(0);
    let selections = 0;
    h.selectByGesture('group:favourites'); selections += 1;
    expect(kind(h)).toBe('group');
    h.selectByGesture('phrase:favourites:0'); selections += 1;
    expect(h.snap.message).toEqual(['Yes. No']);
    expect(h.highlightedId()).toBe('speak');
    h.selectByGesture('speak'); selections += 1;
    expect(selections).toBe(3);
    expect(h.spoken.at(-1)).toBe('Yes. No');
    expect(h.snap.message).toEqual([]);
  });
});

// ═══ M6 ═══════════════════════════════════════════════════════════════════
describe('M6 Favourites end to end', () => {
  it('M6 save-favourite opens a confirmation; Save adds the message to Favourites and keeps it with Last setup', () => {
    const storage = createMemoryStorage();
    const h = ready({ profiles: createLocalProfileStore(() => storage) });
    say(h, PH[0], PH[1], 'save-favourite');
    expect(kind(h)).toBe('confirm');
    expect(ids(h)).toEqual(['confirm-favourite', 'cancel-favourite', 'pause']);
    expect(h.snap.vocabulary.groups[0]!.phrases).toEqual([]);
    raw(h, 'confirm-favourite');
    expect(h.snap.vocabulary.groups[0]!.phrases).toEqual(['Yes. No']);
    expect(kind(h)).toBe('top');
    const profile = JSON.parse(storage.data.get(PROFILE_KEY)!).profiles[0];
    expect(JSON.stringify(profile)).toContain('Yes. No');
    expect(JSON.stringify(profile)).not.toContain('lastSpoken');
  });

  it('M6 Cancel saves nothing', () => {
    const h = ready();
    say(h, PH[0], 'save-favourite');
    raw(h, 'cancel-favourite');
    expect(h.snap.vocabulary.groups[0]!.phrases).toEqual([]);
    expect(h.snap.announcement).toMatch(/Not saved/i);
    expect(kind(h)).toBe('top');
    expect(h.snap.message).toEqual(['Yes']);
  });

  it('M6 auto-return from the confirmation says "Not saved" and saves nothing', () => {
    const h = ready();
    say(h, PH[0], 'save-favourite');
    h.run(13_000, REST);
    expect(kind(h)).toBe('top');
    expect(h.snap.vocabulary.groups[0]!.phrases).toEqual([]);
    expect(h.snap.announcement).toMatch(/Not saved/i);
  });

  it('M6 save-favourite with an empty message only announces', () => {
    const h = ready();
    say(h, 'save-favourite');
    expect(kind(h)).toBe('more');
    expect(h.snap.announcement).toMatch(/Nothing to save/i);
  });
});

// ═══ M7 ═══════════════════════════════════════════════════════════════════
describe('M7 Pause, hold safety, levels and state', () => {
  it('M7 Pause is in every level', () => {
    const h = ready();
    const levels: Array<[string, () => void]> = [
      ['top', () => {}], ['group', () => raw(h, 'group:g1')], ['top again', () => raw(h, 'back')], ['more', () => raw(h, 'more')],
      ['clear', () => raw(h, 'clear')], ['more again', () => raw(h, 'clear-no', 'more')], ['recalibrate', () => raw(h, 'recalibrate')],
      ['back to more', () => raw(h, 'recalibrate-no')],
    ];
    for (const [name, go] of levels) { go(); expect([name, ids(h)]).toEqual([name, expect.arrayContaining(['pause'])]); }
    say(h, 'back', PH[0], 'save-favourite');
    expect(kind(h)).toBe('confirm');
    expect(ids(h)).toContain('pause');
  });

  it('M7 a hold begun before a level swap selects nothing', () => {
    const h = ready();
    h.run(1_500, REST);
    h.run(150, BROW);
    expect(h.snap.scan!.latched).not.toBeNull();
    raw(h, 'more');
    h.run(800, BROW);
    h.run(1_500, REST);
    expect(kind(h)).toBe('more');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.stage).toBe('communication');
    expect(ids(h)[0]).toBe('clear');
  });

  it('M7 message, favourites and lastSpoken survive Pause, tracking loss and the step-idle fallback', () => {
    const h = ready2();
    say(h, PH[0], PH[1], 'save-favourite', 'confirm-favourite', 'speak', PH[2]);
    const keep = () => JSON.stringify({ message: h.snap.message, favourites: h.snap.vocabulary.groups[0]!.phrases, last: h.snap.lastSpoken });
    const before = keep();
    say(h, 'pause');
    h.run(5_000, REST);
    expect(keep()).toBe(before);
    h.session.resume();
    for (let i = 0; i < 20; i += 1) h.step(REST, 'missing');
    expect(keep()).toBe(before);
    h.run(61_000, REST);
    expect(h.snap.stepFallback).toBe(true);
    expect(keep()).toBe(before);
  });

  it('M7 the step-idle fallback with a clear level open returns to the main list, message intact', () => {
    const h = ready2();
    say(h, PH[0], 'clear');
    expect(kind(h)).toBe('clear');
    h.run(61_000, REST);
    expect(h.snap.stepFallback).toBe(true);
    expect(kind(h)).toBe('top');
    expect(snap(h).confirmingClear).toBe(false);
    expect(h.snap.message).toEqual(['Yes']);
    expect(ids(h)).toEqual(TOP);
  });

  it('M7 entering communication again resets the level to the main list', () => {
    const h = ready();
    expect(kind(h)).toBe('top');
    say(h, 'more');
    h.session.useAssisted();
    expect(kind(h)).toBe('top');
  });

  it('M7 level.kind is right for top, group, more, confirm, clear and recalibrate, and the flags derive from it', () => {
    const h = ready();
    const read = () => ({ kind: kind(h), help: snap(h).helperOpen, clear: snap(h).confirmingClear, recal: snap(h).confirmingRecalibrate });
    expect(read()).toEqual({ kind: 'top', help: false, clear: false, recal: false });
    raw(h, 'group:g1');
    expect(read()).toEqual({ kind: 'group', help: false, clear: false, recal: false });
    expect(h.snap.level?.group).toMatchObject({ id: 'g1', name: 'Quick' });
    raw(h, 'back', 'more');
    expect(read()).toEqual({ kind: 'more', help: true, clear: false, recal: false });
    say(h, PH[0]);
    say(h, 'save-favourite');
    expect(read()).toEqual({ kind: 'confirm', help: false, clear: false, recal: false });
    expect(h.snap.level?.confirm).toBe('Yes');
    raw(h, 'cancel-favourite', 'more', 'clear');
    expect(read()).toEqual({ kind: 'clear', help: false, clear: true, recal: false });
    raw(h, 'clear-no', 'more', 'recalibrate');
    expect(read()).toEqual({ kind: 'recalibrate', help: false, clear: false, recal: true });
  });
});

// ═══ M9 (session part) ════════════════════════════════════════════════════
describe('M9 paused Helper and phrase editing', () => {
  it('M9 paused at the Helper level the level stays and phrases can be edited; editing while not paused is refused', () => {
    const h = ready();
    const refused = h.session.editVocabulary({ kind: 'add-phrase', group: 'g1', text: 'Hello' });
    expect(refused.ok).toBe(false);
    say(h, PH[0], 'more', 'pause');
    expect(h.snap.scan!.paused).toBe(true);
    expect(kind(h)).toBe('more');
    const edit = h.session.editVocabulary({ kind: 'add-phrase', group: 'g1', text: 'Hello' });
    expect(edit.ok).toBe(true);
    expect(h.snap.vocabulary.groups[1]!.phrases).toContain('Hello');
    expect(h.snap.message).toEqual(['Yes']);
  });

  it('M9 Resume starts from the main list if the phrases changed, and keeps the level otherwise', () => {
    const changed = ready();
    say(changed, 'more', 'pause');
    changed.session.editVocabulary({ kind: 'add-phrase', group: 'g1', text: 'Hello' });
    changed.session.resume();
    expect(kind(changed)).toBe('top');
    const same = ready();
    say(same, 'more', 'pause');
    same.session.resume();
    expect(kind(same)).toBe('more');
  });
});

// ═══ M10 ══════════════════════════════════════════════════════════════════
describe('M10 caregiver code and secrets', () => {
  const git = (command: string) => execSync(`git ${command}`, { encoding: 'utf8', cwd: process.cwd() });

  it('M10 the merge kept main\'s caregiver, Root and care client code unchanged', () => {
    // Pinned to the merge commit (main was its second parent) so later reviewed changes to these files do not fail it.
    expect(git('diff 1578bab^2 1578bab --stat -- src/care src/Root.tsx src/features').trim()).toBe('');
  });

  it('M10 no secret file or key appears in the merge commit (the only .env file is the example with empty values)', () => {
    const names = git('diff 1578bab^1 1578bab --name-only').split('\n').filter(Boolean);
    expect(names.filter((name) => /(^|\/)\.env(\.|$)/.test(name) && name !== '.env.example')).toEqual([]);
    const example = git('show 1578bab:.env.example').split('\n').filter((line) => /^VITE_/.test(line));
    for (const line of example) expect(line.split('=')[1]?.trim() ?? '').toBe('');
    expect(git(`ls-files`).split('\n').filter((name) => /(^|\/)\.env\.local$/.test(name))).toEqual([]);
    // Real-looking keys: none. Fixtures that test key rejection live only in main's own care tests.
    const real = git('diff -G"eyJ[A-Za-z0-9_-]{30,}" --name-only 1578bab^1 1578bab').trim();
    expect(real).toBe('');
    const fixtures = git('diff -G"sb_secret_[A-Za-z0-9]" --name-only 1578bab^1 1578bab').split('\n').filter(Boolean);
    for (const name of fixtures) expect(name).toMatch(/\.test\.ts$/);
  });
});
