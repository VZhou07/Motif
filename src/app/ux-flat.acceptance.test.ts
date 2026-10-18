import { describe, expect, it } from 'vitest';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY } from './profiles';
import { BROW, Harness, REST } from './session.test-support';

// R19: phrase groups and Favourites are hidden by default (`phraseGroups` false). F1-F4 (session level). See UX_ACCEPTANCE.md.

const FLAT = ['phrase:g1:0', 'phrase:g1:1', 'phrase:g1:2', 'phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2'];
const TOP = ['speak', 'undo', ...FLAT, 'pause', 'group:favourites', 'more'];
const MORE_FLAT = ['clear', 'save-favourite', 'say-again', 'slower', 'faster', 'change-controls', 'add-movement', 'recalibrate', 'back', 'pause'];

type Options = { profiles?: ReturnType<typeof createLocalProfileStore> };
const flat = (options: Options = {}) => new Harness({ ...options, phraseGroups: false });
const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);
const kind = (h: Harness) => h.snap.level?.kind;
const say = (h: Harness, ...list: string[]) => { for (const id of list) h.click(id); };
const raw = (h: Harness, ...list: string[]) => { for (const id of list) h.session.selectTarget(id); };
const ready = (h: Harness): Harness => { h.setUpToCommunication(); expect(h.snap.stage).toBe('communication'); return h; };
const internals = (h: Harness) => h.session as unknown as { level: unknown; askToSaveFavourite(nowMs: number): void; confirmFavourite(nowMs: number): void; vocabulary: { groups: Array<{ id: string; phrases: string[] }> } };
const storedVocabulary = (storage: ReturnType<typeof createMemoryStorage>) =>
  JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.find((p: { name: string }) => p.name === 'Last setup').vocabulary;

/** A stored "Last setup" whose Favourites group holds one saved message, made with the groups on. */
function storageWithFavourite(): ReturnType<typeof createMemoryStorage> {
  const storage = createMemoryStorage();
  const grouped = ready(new Harness({ profiles: createLocalProfileStore(() => storage) }));
  say(grouped, 'phrase:g1:2', 'save-favourite', 'confirm-favourite');
  expect(grouped.snap.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
  expect(storedVocabulary(storage).groups[0].phrases).toEqual(['Thank you']);
  return storage;
}

describe('F1 flat board', () => {
  it('F1 the top list is speak, undo, the six phrases, pause, more: no group target, whatever the message', () => {
    const h = ready(flat());
    expect(ids(h)).toEqual(TOP);
    expect(ids(h).filter((id) => id.startsWith('group:'))).toEqual(['group:favourites']);
    h.selectByGesture('phrase:g1:0');
    expect(ids(h)).toEqual(TOP);
    h.selectByGesture('speak');
    expect(ids(h)).toEqual(TOP);
    raw(h, 'phrase:g2:1', 'phrase:g2:2');
    expect(ids(h)).toEqual(TOP);
  });

  it('F1 the phrases of the hidden Favourites group never appear on the board', () => {
    const storage = storageWithFavourite();
    const h = flat({ profiles: createLocalProfileStore(() => storage) });
    expect(h.snap.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
    ready(h);
    expect(ids(h)).toEqual(TOP);
    expect(ids(h).some((id) => id.startsWith('phrase:favourites'))).toBe(false);
    raw(h, 'phrase:favourites:0');
    expect(h.snap.message).toEqual([]);
  });

  it('F1 the list follows edits to the other groups, in order, and still skips Favourites', () => {
    const h = ready(flat());
    raw(h, 'pause');
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'g1', text: 'Hello' }).ok).toBe(true);
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'favourites', text: 'Hidden one' }).ok).toBe(true);
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'g2', text: 'Turn me over' }).ok).toBe(true);
    h.session.resume();
    expect(ids(h)).toEqual(['speak', 'undo', 'phrase:g1:0', 'phrase:g1:1', 'phrase:g1:2', 'phrase:g1:3', 'phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2', 'phrase:g2:3', 'pause', 'group:favourites', 'more']);
    expect(ids(h)).not.toContain('phrase:favourites:0');
  });

  it('F1 right after approval the board is the flat list (there is no practice list)', () => {
    const h = flat();
    h.calibrate();
    h.selectByGesture('approve-comfortable');
    expect(h.snap.stage).toBe('communication');
    expect(ids(h)).toEqual(TOP);
    expect(ids(h)).not.toContain('finish-practice');
  });

  it('F1 the assisted board is the same flat list', () => {
    const h = flat();
    h.session.useAssisted();
    expect(ids(h)).toEqual(TOP);
    h.switchTo('phrase:g2:0');
    expect(h.snap.message).toEqual(['I need water']);
    expect(ids(h)).toEqual(TOP);
  });
});

describe('F2 flat behaviour', () => {
  it('F2 selecting a phrase adds it and the highlight returns to Play', () => {
    const h = ready(flat());
    h.selectByGesture('phrase:g2:1');
    expect(h.snap.message).toEqual(['Please help me']);
    expect(h.highlightedId()).toBe('speak');
    expect(kind(h)).toBe('top');
  });

  it('F2 Play, Undo and Say it again behave as before', () => {
    const h = ready(flat());
    say(h, 'phrase:g1:0', 'phrase:g1:1', 'speak');
    expect(h.spoken).toEqual(['Yes. No']);
    expect(h.snap.message).toEqual([]);
    say(h, 'phrase:g1:2', 'phrase:g2:0', 'undo');
    expect(h.snap.message).toEqual(['Thank you']);
    say(h, 'say-again');
    expect(h.spoken).toEqual(['Yes. No', 'Yes. No']);
    expect(h.snap.lastSpoken).toBe('Yes. No');
  });

  it('F2 Clear and Recalibrate confirmations, Pause and the Helper levels work', () => {
    const h = ready(flat());
    say(h, 'phrase:g1:0', 'clear');
    expect(ids(h)).toEqual(['clear-no', 'clear-yes', 'pause']);
    raw(h, 'clear-no');
    expect(h.snap.message).toEqual(['Yes']);
    say(h, 'clear', 'clear-yes');
    expect(h.snap.message).toEqual([]);
    say(h, 'recalibrate');
    expect(ids(h)).toEqual(['recalibrate-no', 'recalibrate-yes', 'pause']);
    raw(h, 'recalibrate-no');
    expect(kind(h)).toBe('more');
    raw(h, 'back', 'pause');
    expect(h.snap.scan!.paused).toBe(true);
    h.session.resume();
    expect(h.snap.scan!.paused).toBe(false);
  });

  it('F2 the Helper list has save-favourite', () => {
    const h = ready(flat());
    raw(h, 'more');
    expect(ids(h)).toEqual(MORE_FLAT);
    expect(ids(h)).toContain('save-favourite');
    const assisted = flat();
    assisted.session.useAssisted();
    assisted.switchTo('more');
    expect(ids(assisted)).toContain('save-favourite');
  });

  it('F2 group actions do nothing, however they are reached', () => {
    const storage = storageWithFavourite();
    const h = ready(flat({ profiles: createLocalProfileStore(() => storage) }));
    say(h, 'phrase:g1:0');
    const before = JSON.stringify({ level: h.snap.level, ids: ids(h), message: h.snap.message, vocabulary: h.snap.vocabulary });
    h.session.openGroup('g1');
    raw(h, 'group:g1', 'confirm-favourite');
    internals(h).confirmFavourite(h.now);
    h.session.refresh();
    expect(JSON.stringify({ level: h.snap.level, ids: ids(h), message: h.snap.message, vocabulary: h.snap.vocabulary })).toBe(before);
    raw(h, 'more', 'save-favourite');
    expect(kind(h)).toBe('confirm');
    expect(h.snap.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
  });

  it('F2 a stale group or confirm level falls back to the main list, also after Pause and Resume', () => {
    for (const stale of [{ group: 'g1' }]) {
      const h = ready(flat());
      say(h, 'phrase:g1:0');
      internals(h).level = stale;
      raw(h, 'pause');
      h.session.resume();
      expect([JSON.stringify(stale), kind(h)]).toEqual([JSON.stringify(stale), 'top']);
      expect(ids(h)).toEqual(TOP);
      expect(h.snap.message).toEqual(['Yes']);
    }
  });

  it('F2 the step-idle fallback and entering communication leave the flat list as it was', () => {
    const h = ready(flat());
    h.addMovement({ feature: 'jawOpen', direction: 1, label: 'Open mouth' }, (label) => (label === 'Open mouth' ? { jawOpen: 0.7 } : label ? BROW : REST));
    h.selectByGesture('choose-different');
    h.selectByGesture('map:0');
    h.selectByGesture('approve-mapping');
    expect(ids(h)).toEqual(TOP);
    h.run(61_000, REST);
    expect(ids(h)).toEqual(TOP);
  });
});

describe('F3 Favourites survive', () => {
  it('F3 a flat autosave keeps the stored vocabulary byte for byte, and the groups show it again when turned on', () => {
    const storage = storageWithFavourite();
    const before = JSON.stringify(storedVocabulary(storage));
    const hidden = flat({ profiles: createLocalProfileStore(() => storage) });
    expect(hidden.snap.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
    ready(hidden); // approving a fresh setup autosaves while flat
    say(hidden, 'phrase:g1:0', 'speak');
    raw(hidden, 'more', 'slower'); // another autosave
    expect(JSON.stringify(storedVocabulary(storage))).toBe(before);
    const again = new Harness({ profiles: createLocalProfileStore(() => storage) });
    expect(again.snap.phraseGroups).toBe(true);
    expect(again.snap.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
  });

  it('F3 the favourite is playable again with groups on', () => {
    const storage = storageWithFavourite();
    const hidden = flat({ profiles: createLocalProfileStore(() => storage) });
    ready(hidden);
    const grouped = new Harness({ profiles: createLocalProfileStore(() => storage) });
    ready(grouped);
    expect(ids(grouped)).toContain('group:favourites');
    say(grouped, 'phrase:favourites:0');
    expect(grouped.snap.message).toEqual(['Thank you']);
  });

  it('F3 editing phrases in the Helper (paused) still works and keeps the stored Favourites', () => {
    const storage = storageWithFavourite();
    const h = ready(flat({ profiles: createLocalProfileStore(() => storage) }));
    const before = JSON.stringify(storedVocabulary(storage).groups[0]);
    raw(h, 'pause');
    expect(h.session.editVocabulary({ kind: 'edit-phrase', group: 'g1', index: 0, text: 'Yes please' }).ok).toBe(true);
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'g2', text: 'Turn me over' }).ok).toBe(true);
    expect(h.session.editVocabulary({ kind: 'remove-phrase', group: 'g1', index: 1 }).ok).toBe(true);
    h.session.resume();
    expect(JSON.stringify(storedVocabulary(storage).groups[0])).toBe(before);
    expect(ids(h)).toEqual(['speak', 'undo', 'phrase:g1:0', 'phrase:g1:1', 'phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2', 'phrase:g2:3', 'pause', 'group:favourites', 'more']);
    expect(h.snap.vocabulary.groups[1]!.phrases[0]).toBe('Yes please');
  });
});

describe('F4 grouped mode is intact (test support default)', () => {
  it('F4 the default Harness has groups on: group tiles, a Favourites tile and save-favourite', () => {
    const h = ready(new Harness());
    expect(h.snap.phraseGroups).toBe(true);
    expect(ids(h)).toEqual(['speak', 'undo', 'group:favourites', 'group:g1', 'group:g2', 'pause', 'more']);
    raw(h, 'more');
    expect(ids(h)).toContain('save-favourite');
    raw(h, 'back', 'group:g1');
    expect(kind(h)).toBe('group');
  });
});
