import { describe, expect, it } from 'vitest';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY, type StoredProfile } from './profiles';
import { Harness } from './session.test-support';

/** R19: phrase groups and Favourites are hidden by default; saved Favourites are untouched. */
const storedFavourites = (storage: ReturnType<typeof createMemoryStorage>) =>
  JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.find((p: StoredProfile) => p.name === 'Last setup').vocabulary.groups[0].phrases;
const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);
const flat = (options: { profiles?: ReturnType<typeof createLocalProfileStore> } = {}) => new Harness({ ...options, phraseGroups: false });
const FLAT_PHRASES = ['phrase:g1:0', 'phrase:g1:1', 'phrase:g1:2', 'phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2'];

describe('flat board', () => {
  it('lists Speak, Undo, the six phrases, Pause and the Helper, the same for any message', () => {
    const h = flat();
    h.setUpToCommunication();
    expect(ids(h)).toEqual(['speak', 'undo', ...FLAT_PHRASES, 'pause', 'group:favourites', 'more']);
    h.selectByGesture('phrase:g1:0');
    expect(h.snap.message).toEqual(['Yes']);
    expect(ids(h)).toEqual(['speak', 'undo', ...FLAT_PHRASES, 'pause', 'group:favourites', 'more']);
    expect(h.highlightedId()).toBe('speak'); // the highlight returns to Speak after a phrase
    expect(h.snap.phraseGroups).toBe(false);
  });

  it('Favourites button: save a message in the Helper, open it beside Helper, pick it, Back returns', () => {
    const h = flat();
    h.setUpToCommunication();
    h.selectByGesture('group:favourites');
    expect(h.snap.level?.kind).toBe('top'); // empty: announces only
    h.selectByGesture('phrase:g1:0');
    h.selectByGesture('more');
    h.selectByGesture('save-favourite');
    expect(h.snap.level?.kind).toBe('confirm');
    h.selectByGesture('confirm-favourite');
    expect(h.snap.vocabulary.groups[0]!.phrases).toEqual(['Yes']);
    h.selectByGesture('speak');
    h.selectByGesture('group:favourites');
    expect(h.snap.level?.kind).toBe('group');
    expect(ids(h)).toEqual(['phrase:favourites:0', 'back', 'pause']);
    h.selectByGesture('phrase:favourites:0');
    expect(h.snap.message).toEqual(['Yes']);
    expect(h.snap.level?.kind).toBe('top');
    h.selectByGesture('group:favourites');
    h.selectByGesture('back');
    expect(h.snap.level?.kind).toBe('top');
  });

  it('the Helper has Save to Favourites, and group actions do nothing', () => {
    const h = flat();
    h.setUpToCommunication();
    h.selectByGesture('more');
    expect(ids(h)).toContain('save-favourite');
    h.session.selectTarget('back');
    h.selectByGesture('phrase:g1:0');
    h.session.openGroup('g1');
    expect(h.snap.level?.kind).toBe('top');
  });

  it('the grouped board is still available when the option is on', () => {
    const grouped = new Harness();
    grouped.setUpToCommunication();
    expect(grouped.snap.phraseGroups).toBe(true);
    expect(ids(grouped)).toContain('group:g1');
  });

  it('keeps saved Favourites byte-for-byte through a flat autosave, and shows them again with groups on', () => {
    const storage = createMemoryStorage();
    const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
    first.setUpToCommunication();
    first.selectByGesture('phrase:g1:2');
    first.selectByGesture('save-favourite');
    first.selectByGesture('confirm-favourite');
    const before = storedFavourites(storage);
    expect(before).toEqual(['Thank you']);
    const hidden = flat({ profiles: createLocalProfileStore(() => storage) });
    expect(hidden.snap.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
    hidden.setUpToCommunication(); // approving a fresh setup autosaves in flat mode
    expect(hidden.snap.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
    expect(storedFavourites(storage)).toEqual(before);
    const again = new Harness({ profiles: createLocalProfileStore(() => storage) });
    expect(again.snap.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
    expect(again.snap.phraseGroups).toBe(true);
  });

  it('editing phrases still works and edits any group', () => {
    const h = flat();
    h.setUpToCommunication();
    h.selectByGesture('pause');
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'g2', text: 'Turn me over' }).ok).toBe(true);
    h.session.resume();
    expect(ids(h)).toContain('phrase:g2:3');
  });
});
