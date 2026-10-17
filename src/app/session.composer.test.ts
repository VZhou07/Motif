import { describe, expect, it } from 'vitest';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY } from './profiles';
import { BROW, CHEEK, Harness, MOUTH, PUCKER, REST, type Values } from './session.test-support';
import type { MovementChoice } from './types';
import { VOCABULARY_LIMITS } from './vocabulary';

/** Composer actions (R14 C1e): Undo last, Say again, and the scanned Save-to-Favourites confirmation. */

const MOVES: Record<string, Values> = { 'Raise left outer eyebrow': BROW, 'Open mouth': MOUTH, 'Pucker lips': PUCKER, 'Puff cheeks': CHEEK };
const perform = (label: string | null): Values => MOVES[label ?? ''] ?? REST;
const OPEN_MOUTH: MovementChoice = { feature: 'jawOpen', direction: 1, label: 'Open mouth' };
const PUCKER_LIPS: MovementChoice = { feature: 'mouthPucker', direction: 1, label: 'Pucker lips' };
const PUFF_CHEEKS: MovementChoice = { feature: 'cheekPuff', direction: 1, label: 'Puff cheeks' };

/** Counts every write to browser storage so tests can prove nothing is stored before an explicit profile Save. */
function spiedStore() {
  const storage = createMemoryStorage();
  let writes = 0;
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { writes += 1; setItem(key, value); };
  return { storage, store: createLocalProfileStore(() => storage), writes: () => writes };
}

function ready(options: ConstructorParameters<typeof Harness>[0] = {}): Harness {
  const h = new Harness(options);
  h.setUpToCommunication();
  return h;
}

function addAndApprove(h: Harness, choice: MovementChoice): void {
  if (h.snap.scanMode === 'step') h.stepTo('more'); else h.selectByGesture('more');
  h.addMovement(choice, perform);
  h.selectByGesture('comfortable');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  h.stepTo('finish-practice');
}

const favourites = (h: Harness) => h.snap.vocabulary.groups[0]!.phrases;
const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);

/** Assisted (helper clicks): put `phrases` in the message, then ask to save it to Favourites. */
function askToSave(h: Harness, ...phrases: string[]): void {
  for (const id of phrases) h.click(id);
  h.click('save-favourite');
}

describe('undo and say again', () => {
  it('undo removes only the last phrase, and says so when there is nothing to undo', () => {
    const h = ready();
    h.selectByGesture('undo');
    expect(h.snap.announcement).toBe('Nothing to undo.');
    h.selectByGesture('phrase:g1:0');
    h.selectByGesture('phrase:g2:1');
    expect(h.snap.message).toEqual(['Yes', 'Please help me']);
    h.selectByGesture('undo');
    expect(h.snap.message).toEqual(['Yes']);
    expect(h.snap.announcement).toBe('Removed “Please help me”.');
    expect(ids(h)[1]).toBe('undo'); // stays in place on the main list
  });

  it('say again repeats the last spoken message from memory only', () => {
    const h = new Harness();
    h.session.useAssisted();
    h.click('say-again');
    expect(h.snap.announcement).toBe('Nothing has been spoken yet.');
    expect(h.spoken).toEqual([]);
    h.click('phrase:g1:2');
    h.click('speak');
    h.click('clear');
    h.click('say-again');
    expect(h.spoken).toEqual(['Thank you', 'Thank you']);
    expect(h.snap.message).toEqual([]);
    expect(h.snap.announcement).toBe('Speaking again: Thank you');
    h.speechAvailable = false;
    h.click('say-again');
    expect(h.snap.announcement).toMatch(/Local speech is not available.*Thank you/);
  });
});

describe('save to Favourites', () => {
  it('asks first with Save, Cancel and Pause; saving copies the message and keeps it in Last setup (R19)', () => {
    const { store, writes, storage } = spiedStore();
    const h = ready({ profiles: store });
    const before = writes();
    h.selectByGesture('phrase:g1:0');
    h.selectByGesture('phrase:g1:2');
    h.selectByGesture('save-favourite');
    expect(h.snap.level).toMatchObject({ kind: 'confirm', confirm: 'Yes. Thank you' });
    expect(ids(h)).toEqual(['confirm-favourite', 'cancel-favourite', 'pause']);
    expect(h.snap.scan!.targets[0]!.label).toBe('Save “Yes. Thank you” to Favourites');
    expect(favourites(h)).toEqual([]);
    expect(writes()).toBe(before); // opening the confirmation writes nothing
    h.selectByGesture('confirm-favourite');
    expect(favourites(h)).toEqual(['Yes. Thank you']);
    expect(h.snap.message).toEqual(['Yes', 'Thank you']);
    expect(h.snap.level?.kind).toBe('top');
    // R19 (intentional change from C1): with an approved setup the favourite is kept in Last setup at once.
    expect(h.snap.announcement).toBe('Saved to Favourites. It is kept on this device with Last setup.');
    expect(writes()).toBe(before + 1);
    const lastSetup = () => JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.find((profile: { name: string }) => profile.name === 'Last setup');
    expect(lastSetup().vocabulary.groups[0].phrases).toEqual(['Yes. Thank you']);
    expect(h.snap.scan!.targets.find((target) => target.id === 'group:favourites')?.label).toBe('Open Favourites, 1 phrase');
    // Undo, Say again, a cancelled save: nothing more written.
    h.selectByGesture('undo');
    h.selectByGesture('say-again');
    h.selectByGesture('save-favourite');
    h.selectByGesture('cancel-favourite');
    expect(h.snap.announcement).toBe('Not saved.');
    expect(writes()).toBe(before + 1);
    // The favourite is reachable and adds to the message like any phrase.
    h.selectByGesture('phrase:favourites:0');
    expect(h.snap.message).toEqual(['Yes', 'Yes. Thank you']);
    // The named Save (API only since main removed its panel) still counts favourites.
    expect(h.session.saveProfile('Person A')).toEqual({ ok: true });
    expect(writes()).toBe(before + 2);
    expect(h.snap.announcement).toMatch(/including 1 favourite\./);
    const raw = storage.data.get(PROFILE_KEY)!;
    const named = JSON.parse(raw).profiles.find((profile: { name: string }) => profile.name === 'Person A');
    expect(named.vocabulary.groups[0].phrases).toEqual(['Yes. Thank you']);
    expect(raw).not.toMatch(/lastSpoken|"message"/);
  });

  it('says why and never asks when the message is empty, already saved, too long or Favourites is full', () => {
    const h = new Harness();
    h.session.useAssisted();
    h.click('save-favourite');
    expect(h.snap.announcement).toBe('Nothing to save yet. Add a phrase first.');
    expect(h.snap.level?.kind).toBe('more');
    h.click('clear');
    askToSave(h, 'phrase:g1:0');
    h.click('confirm-favourite');
    expect(h.snap.announcement).toBe('Saved to Favourites. It is kept on this device only once a movement setup is approved.');
    h.click('save-favourite'); // same message again
    expect(h.snap.announcement).toBe('“Yes” is already in Favourites.');
    expect(h.snap.level?.kind).toBe('more');
    h.click('clear');
    const long = ['phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2', 'phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2', 'phrase:g2:2', 'phrase:g2:0'];
    askToSave(h, ...long);
    expect(h.snap.message.join('. ').length).toBeGreaterThan(VOCABULARY_LIMITS.phraseMax);
    expect(h.snap.announcement).toBe('A phrase can be at most 120 characters.');
    expect(h.snap.level?.kind).toBe('more');
    h.click('clear');
    const pool = ['phrase:g1:0', 'phrase:g1:1', 'phrase:g1:2', 'phrase:g2:0', 'phrase:g2:1', 'phrase:g2:2'];
    for (let i = 0; favourites(h).length < VOCABULARY_LIMITS.phrases; i += 1) {
      askToSave(h, pool[i % 6]!, pool[Math.floor(i / 6) % 6]!);
      if (h.snap.level?.kind === 'confirm') h.click('confirm-favourite');
      h.click('clear');
    }
    const full = [...favourites(h)];
    askToSave(h, 'phrase:g1:1', 'phrase:g1:1', 'phrase:g1:1');
    expect(h.snap.announcement).toBe('Favourites is full (12 phrases). Remove one first.');
    expect(h.snap.level?.kind).toBe('more');
    expect(favourites(h)).toEqual(full);
  });

  it('two idle passes on the confirmation mean Cancel', () => {
    const h = ready();
    h.selectByGesture('phrase:g1:0');
    h.selectByGesture('save-favourite');
    const at = h.now;
    h.run(16_000);
    expect(h.snap.level?.kind).toBe('top');
    expect(h.now - at).toBeGreaterThan(6_000);
    expect(h.snap.announcement).toBe('Not saved. Back to the main list.');
    expect(favourites(h)).toEqual([]);
  });

  it('a helper shortcut away from the confirmation means Cancel', () => {
    const h = new Harness();
    h.session.useAssisted();
    askToSave(h, 'phrase:g2:0');
    h.session.openGroup('g1');
    expect(h.snap.announcement).toBe('Not saved. Quick: 3 phrases.');
    expect(favourites(h)).toEqual([]);
  });
});

describe('the confirmation keeps routed controls (R14 B1)', () => {
  it('with Next/Previous/Pause mapped, only the select movement saves', () => {
    const h = ready();
    addAndApprove(h, OPEN_MOUTH);
    addAndApprove(h, PUCKER_LIPS);
    addAndApprove(h, PUFF_CHEEKS);
    const actionOf = (action: string) => {
      const id = Object.entries(h.snap.mapping!.assignments).find(([, value]) => value === action)![0];
      return perform(h.snap.approvedModels.find((model) => model.id === id)!.label);
    };
    const [select, next, previous, pause] = ['select', 'next', 'previous', 'pause'].map(actionOf);
    h.stepTo('phrase:g1:1', next, select);
    h.stepTo('save-favourite', next, select);
    expect(h.snap.level?.kind).toBe('confirm');
    h.run(600);
    for (const movement of [next, next, previous]) { h.run(600, movement); h.run(600); }
    expect(h.highlightedId()).toBe('cancel-favourite');
    expect(favourites(h)).toEqual([]);
    h.run(600, pause); h.run(600);
    expect(h.snap.scan?.paused).toBe(true);
    expect(favourites(h)).toEqual([]);
    h.run(600, select); h.run(600); // resumes, nothing selected
    expect(h.snap.scan?.paused).toBe(false);
    expect(h.snap.level?.kind).toBe('confirm');
    expect(h.highlightedId()).toBe('confirm-favourite');
    expect(favourites(h)).toEqual([]);
    h.run(600, select); h.run(600);
    expect(favourites(h)).toEqual(['No']);
  });
});

describe('editing phrases while paused (R14)', () => {
  it('is refused while scanning and in practice, allowed while paused, and Resume then starts at the main list', () => {
    const h = new Harness();
    h.session.useAssisted();
    h.click('phrase:g2:0');
    h.click('save-favourite');
    expect(h.snap.level?.kind).toBe('confirm');
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'favourites', text: 'I need water' }).ok).toBe(false);
    h.session.selectTarget('pause');
    expect(h.snap.scan?.paused).toBe(true);
    // A helper saves the same text by hand while paused; the pending confirmation must not add it twice.
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'favourites', text: 'I need water' }).ok).toBe(true);
    h.session.resume();
    expect(h.snap.level?.kind).toBe('top');
    expect(h.snap.announcement).toBe('Resumed at the main list because the phrases changed. Not saved.');
    expect(favourites(h)).toEqual(['I need water']);
    h.click('save-favourite');
    expect(h.snap.announcement).toBe('“I need water” is already in Favourites.');
  });

  it('Resume keeps the level when nothing changed while paused', () => {
    const h = new Harness();
    h.session.useAssisted();
    h.session.openGroup('g2');
    h.session.selectTarget('pause');
    expect(h.session.editVocabulary({ kind: 'edit-phrase', group: 'g2', index: 9, text: 'x' }).ok).toBe(false); // refused edit
    h.session.resume();
    expect(h.snap.level?.group?.id).toBe('g2');
    expect(h.highlightedId()).toBe('phrase:g2:0');
  });

  it('cannot edit during practice', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable'); // first movement: one approve screen (main UX slice 2)
    expect(h.snap.stage).toBe('practice');
    h.selectByGesture('pause');
    expect(h.session.editVocabulary({ kind: 'add-group', name: 'Family' }).ok).toBe(false);
  });
});
