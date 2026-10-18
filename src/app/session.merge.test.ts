import { describe, expect, it } from 'vitest';
import { createLocalProfileStore, createMemoryStorage, parseProfile, PROFILE_KEY, type StoredProfile } from './profiles';
import { BROW, Harness, REST } from './session.test-support';
import { defaultVocabulary } from './vocabulary';

/** R19: C1 phrase groups merged with main's automatic Last setup. Favourites are kept and never silently lost. */

const LAST = 'Last setup';
type Storage = ReturnType<typeof createMemoryStorage>;
const storeOn = (storage: Storage) => createLocalProfileStore(() => storage);
const lastFavourites = (storage: Storage): string[] =>
  JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.find((profile: StoredProfile) => profile.name === LAST).vocabulary.groups[0].phrases;
const favourites = (h: Harness) => h.snap.vocabulary.groups[0]!.phrases;

/** One movement approved on a page using `storage`, with "Thank you" confirmed as a favourite. */
function withFavourite(storage: Storage = createMemoryStorage()): { h: Harness; storage: Storage } {
  const h = new Harness({ profiles: storeOn(storage) });
  h.setUpToCommunication();
  h.click('phrase:g1:2');
  h.click('save-favourite');
  h.click('confirm-favourite');
  expect(h.snap.announcement).toBe('Saved to Favourites. It is kept on this device with Last setup.');
  expect(lastFavourites(storage)).toEqual(['Thank you']);
  return { h, storage };
}

/** A fresh first-movement setup on this page (rest check, training, checks, one approve screen). */
function setUpAgain(h: Harness): void {
  h.calibrate();
  h.selectByGesture('approve-comfortable');
  expect(h.snap.stage).toBe('communication');
}

describe('favourites survive the ways back to a fresh setup (R19 B1)', () => {
  it('a reload loads the phrases from Last setup, and Set up again keeps them', () => {
    const { storage } = withFavourite();
    const page = new Harness({ profiles: storeOn(storage) });
    expect(favourites(page)).toEqual(['Thank you']);
    setUpAgain(page);
    expect(lastFavourites(storage)).toEqual(['Thank you']);
  });

  it('back to start keeps the phrases, and Set up again keeps them', () => {
    const { h, storage } = withFavourite();
    expect(h.session.returnToStart()).toBe(true);
    expect(favourites(h)).toEqual(['Thank you']);
    setUpAgain(h);
    expect(lastFavourites(storage)).toEqual(['Thank you']);
  });

  it('a failed Continue (rest no longer fits) never replaces the phrases, so a fresh setup keeps them', () => {
    const { storage } = withFavourite();
    const page = new Harness({ profiles: storeOn(storage) });
    const brow = JSON.parse(storage.data.get(PROFILE_KEY)!).profiles[0].models[0];
    page.session.setCamera('running');
    expect(page.session.restoreProfile(LAST)).toBe(true);
    const spike = brow.baselineCenter + brow.releaseThreshold * 1.6;
    page.run(10_500, (t) => (t % 2_000 < 300 ? { browOuterUpLeft: spike } : REST));
    expect(page.snap.failure?.kind).toBe('profile-mismatch');
    expect(favourites(page)).toEqual(['Thank you']);
    setUpAgain(page);
    expect(lastFavourites(storage)).toEqual(['Thank you']);
  });

  it('assisted input, then Set up a movement, keeps them', () => {
    const { storage } = withFavourite();
    const page = new Harness({ profiles: storeOn(storage) });
    page.session.useAssisted();
    page.click('setup-gesture');
    expect(page.snap.stage).toBe('welcome');
    setUpAgain(page);
    expect(lastFavourites(storage)).toEqual(['Thank you']);
  });
});

describe('one autosave rule while a setup is approved (R19)', () => {
  it('a paused communication edit is kept at once', () => {
    const { h, storage } = withFavourite();
    h.session.selectTarget('pause');
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'favourites', text: 'Call my sister' }).ok).toBe(true);
    expect(lastFavourites(storage)).toEqual(['Thank you', 'Call my sister']);
  });

  it('a setup-stage edit during recalibration is kept at once', () => {
    const { h, storage } = withFavourite();
    h.selectByGesture('recalibrate');
    h.selectByGesture('recalibrate-yes');
    h.run(10_500);
    expect(h.snap.stage).toBe('choose');
    expect(h.session.editVocabulary({ kind: 'remove-phrase', group: 'favourites', index: 0 }).ok).toBe(true);
    expect(lastFavourites(storage)).toEqual([]);
  });

  it('a refused edit writes nothing', () => {
    const { h, storage } = withFavourite();
    h.session.selectTarget('pause');
    const before = storage.data.get(PROFILE_KEY);
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'favourites', text: 'thank you' }).ok).toBe(false);
    expect(storage.data.get(PROFILE_KEY)).toBe(before);
  });

  it('says honestly when this browser cannot keep the favourite', () => {
    const storage = createMemoryStorage();
    const h = new Harness({ profiles: storeOn(storage) });
    h.setUpToCommunication();
    storage.setItem = () => { throw new Error('quota'); };
    h.click('phrase:g1:0');
    h.click('save-favourite');
    h.click('confirm-favourite');
    expect(favourites(h)).toEqual(['Yes']);
    expect(h.snap.announcement).toBe('Saved to Favourites for now; this browser could not keep it, so it will be gone when this page closes.');
  });

  it('a favourite saved after a quick Continue keeps the carried check times', () => {
    const { h, storage } = withFavourite();
    const times = JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.find((profile: StoredProfile) => profile.name === LAST).checks;
    expect(h.session.returnToStart()).toBe(true);
    h.now += 60_000;
    expect(h.session.restoreProfile(LAST, true)).toBe(true);
    expect(h.snap.stage).toBe('mapping-confirm');
    h.selectByGesture('approve-mapping', BROW, 60_000, 600, 0);
    h.click('phrase:g1:1');
    h.click('save-favourite');
    h.click('confirm-favourite');
    const saved = JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.find((profile: StoredProfile) => profile.name === LAST);
    expect(saved.vocabulary.groups[0].phrases).toEqual(['Thank you', 'No']);
    expect(saved.checks).toEqual(times);
  });
});

describe('Delete really removes favourites (R19 condition 2)', () => {
  it.each([
    ['Delete all', (h: Harness) => h.session.deleteAllProfiles()],
    ['Delete Last setup', (h: Harness) => h.session.deleteProfile(LAST)],
  ])('%s, then a fresh setup stores empty Favourites and the default groups', (_name, remove) => {
    const { storage } = withFavourite();
    const page = new Harness({ profiles: storeOn(storage) });
    expect(favourites(page)).toEqual(['Thank you']);
    expect(remove(page).ok).toBe(true);
    expect(page.snap.vocabulary).toEqual(defaultVocabulary());
    setUpAgain(page);
    const saved = JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.find((profile: StoredProfile) => profile.name === LAST);
    expect(saved.vocabulary).toEqual(defaultVocabulary());
  });
});

describe('Continue puts back the saved phrases (R19)', () => {
  it('a quick Continue replaces phrases typed on the start screen with the saved ones, and says so', () => {
    const storage = createMemoryStorage();
    const first = new Harness({ profiles: storeOn(storage) });
    first.now = 10 * 60 * 60_000;
    first.setUpToCommunication();
    const page = new Harness({ profiles: storeOn(storage) });
    page.now = first.now + 60_000;
    expect(page.session.editVocabulary({ kind: 'add-phrase', group: 'favourites', text: 'Typed on start screen' }).ok).toBe(true);
    page.session.setCamera('running');
    expect(page.session.restoreProfile(LAST, true)).toBe(true);
    expect(page.snap.stage).toBe('mapping-confirm');
    expect(favourites(page)).toEqual(['Typed on start screen']); // nothing applied before approval
    page.selectByGesture('approve-mapping', BROW, 60_000, 600, 0);
    expect(favourites(page)).toEqual([]);
    expect(page.snap.announcement).toMatch(/Your phrases were replaced by the ones saved with “Last setup”\./);
    expect(lastFavourites(storage)).toEqual([]);
  });
});

describe('loading phrases at page start', () => {
  it('still uses Last setup when another stored entry is unreadable', () => {
    const { storage } = withFavourite();
    const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
    raw.profiles.unshift({ junk: true });
    storage.setItem(PROFILE_KEY, JSON.stringify(raw));
    expect(favourites(new Harness({ profiles: storeOn(storage) }))).toEqual(['Thank you']);
  });


  it('uses the defaults with no saved setup, an unreadable store, or blocked storage', () => {
    expect(new Harness().snap.vocabulary).toEqual(defaultVocabulary());
    const corrupt = createMemoryStorage();
    corrupt.setItem(PROFILE_KEY, '{not json');
    expect(new Harness({ profiles: storeOn(corrupt) }).snap.vocabulary).toEqual(defaultVocabulary());
    const blocked = createLocalProfileStore(() => { throw new Error('SecurityError'); });
    expect(new Harness({ profiles: blocked }).snap.vocabulary).toEqual(defaultVocabulary());
  });

  it('with two readable entries named Last setup (an older build appended one), uses the first, as restore does', () => {
    const { storage } = withFavourite();
    const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
    const ours = raw.profiles.find((profile: StoredProfile) => profile.name === LAST);
    const { vocabulary: _vocabulary, ...rest } = ours;
    const older = { ...rest, version: 1, phrases: ['Hi', 'No', 'I need water', 'Please help me', 'I am uncomfortable', 'Thank you'] };
    raw.profiles.push(older);
    storage.setItem(PROFILE_KEY, JSON.stringify(raw));
    const store = storeOn(storage);
    expect(store.list().profiles.filter((profile) => profile.name === LAST)).toHaveLength(2);
    expect(store.get(LAST)?.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
    expect(new Harness({ profiles: store }).snap.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
    // Replacing by name rewrites the first readable entry and leaves the older one untouched.
    expect(store.save({ ...store.get(LAST)!, scanIntervalMs: 3_000 }, true)).toEqual({ ok: true });
    const entries = JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.filter((profile: StoredProfile) => profile.name === LAST);
    expect(entries.map((entry: { version: number; scanIntervalMs: number }) => [entry.version, entry.scanIntervalMs])).toEqual([[2, 3_000], [1, ours.scanIntervalMs]]);
  });
});

describe('migrated version 1 entries with check times (R19)', () => {
  function v1Last(storage: Storage): Record<string, unknown> {
    const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
    const ours = raw.profiles.find((profile: StoredProfile) => profile.name === LAST);
    const { vocabulary: _vocabulary, ...rest } = ours;
    return { ...rest, version: 1, phrases: ['Yes', 'No', 'I need water', 'Please help me', 'I am uncomfortable', 'Thank you'] };
  }

  it('keeps the resting numbers and check times, and still rejects check times for unknown movements', () => {
    const { storage } = withFavourite();
    const v1 = v1Last(storage);
    const parsed = parseProfile(v1);
    expect(parsed.ok && parsed.value.checks).toEqual(v1.checks);
    expect(parsed.ok && parsed.value.baseline).toEqual(v1.baseline);
    const bad = { ...v1, checks: { movementAt: { 'not-a-movement': 5 } } };
    expect(parseProfile(bad)).toMatchObject({ ok: false, reasons: ['The saved check times are not readable.'] });
  });

  it('a failed Continue of a migrated entry rewrites it as version 2 without check times', () => {
    const { storage } = withFavourite();
    const v1 = v1Last(storage);
    storage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, profiles: [v1] }));
    const page = new Harness({ profiles: storeOn(storage) });
    const brow = (v1.models as Array<{ baselineCenter: number; releaseThreshold: number }>)[0]!;
    page.session.setCamera('running');
    expect(page.session.restoreProfile(LAST, true)).toBe(true);
    const spike = brow.baselineCenter + brow.releaseThreshold * 1.6;
    page.run(10_500, (t) => (t % 2_000 < 300 ? { browOuterUpLeft: spike } : REST));
    if (page.snap.stage === 'baseline') page.run(10_500, (t) => (t % 2_000 < 300 ? { browOuterUpLeft: spike } : REST));
    expect(page.snap.failure?.kind).toBe('profile-mismatch');
    const [entry] = JSON.parse(storage.data.get(PROFILE_KEY)!).profiles;
    expect(entry.version).toBe(2);
    expect(entry).not.toHaveProperty('checks');
    expect(entry.vocabulary.groups[1]).toEqual({ id: 'g1', name: 'Phrases', phrases: v1.phrases });
  });
});

