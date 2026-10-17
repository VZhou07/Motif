import { describe, expect, it } from 'vitest';
import { createLocalProfileStore, createMemoryStorage, parseProfile, PROFILE_KEY, type ProfileStore } from './profiles';
import { BROW, HEAD_WOBBLE, Harness, MOUTH, REST, type Values } from './session.test-support';

const BROW_LABEL = 'Raise left outer eyebrow';
const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const perform = (label: string | null): Values => (label === BROW_LABEL ? BROW : label === 'Open mouth' ? MOUTH : REST);

function storeFor(storage = createMemoryStorage()): { storage: ReturnType<typeof createMemoryStorage>; store: ProfileStore } {
  return { storage, store: createLocalProfileStore(() => storage) };
}

/** Person A: edited phrase, slower scanning, brow selects and mouth moves next; saved as "Person A". */
function savedPersonA() {
  const { storage, store } = storeFor();
  const h = new Harness({ profiles: store });
  h.session.setPhrase(0, 'Hello');
  h.setUpToCommunication();
  h.selectByGesture('slower');
  h.addMovement(OPEN_MOUTH, perform);
  h.selectByGesture('comfortable');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  h.stepTo('finish-practice');
  h.session.selectTarget('phrase:2'); // a message that must never be saved
  expect(h.session.saveProfile('Person A')).toEqual({ ok: true });
  return { storage, store, original: h };
}

/** A fresh page (new session) on the same device, camera running, restore started. */
function restoreOn(storage: ReturnType<typeof createMemoryStorage>, name = 'Person A'): Harness {
  const h = new Harness({ profiles: storeFor(storage).store });
  h.session.setCamera('running');
  expect(h.session.restoreProfile(name)).toBe(true);
  return h;
}

function recheck(h: Harness, everyday: (t: number) => Values = HEAD_WOBBLE): void {
  h.run(10_500);
  h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
  if (h.snap.stage === 'negative') h.run(11_000, everyday);
}

describe('saving a profile (R7)', () => {
  it('saves only after approval, only on an explicit call, and never the message or evidence', () => {
    const { store } = storeFor();
    const h = new Harness({ profiles: store });
    expect(h.session.saveProfile('Too early')).toMatchObject({ ok: false });
    h.calibrate();
    expect(h.session.saveProfile('During setup')).toMatchObject({ ok: false });
    expect(store.list().profiles).toEqual([]);

    const { storage, original } = savedPersonA();
    expect(original.snap.profiles).toMatchObject({ names: ['Last setup', 'Person A'], active: 'Person A', unsaved: false });
    const raw = storage.data.get(PROFILE_KEY)!;
    expect(original.snap.message).toEqual(['I need water']);
    expect(raw).not.toMatch(/"message"|lastSpoken/);
    expect(raw).not.toMatch(/heldOut|negative|frame|timestamp/);
    const saved = JSON.parse(raw).profiles.find((profile: { name: string }) => profile.name === 'Person A');
    expect(saved.phrases[0]).toBe('Hello');
    expect(saved.scanIntervalMs).toBe(2_500);
    expect(saved.models).toHaveLength(2);
  });

  it('marks the setup unsaved after a change and refuses a duplicate name unless replacing', () => {
    const { original } = savedPersonA();
    original.stepTo('change-controls');
    original.selectByGesture('map:1');
    original.selectByGesture('approve-mapping');
    expect(original.snap.profiles.unsaved).toBe(true);
    expect(original.session.saveProfile('person a')).toMatchObject({ ok: false, code: 'exists' });
    expect(original.session.saveProfile('Person A', true)).toEqual({ ok: true });
    expect(original.snap.profiles.unsaved).toBe(false);
  });

  it('delete and delete all leave the approved setup in memory and clear the active name', () => {
    const { original } = savedPersonA();
    expect(original.session.deleteProfile('Person A')).toEqual({ ok: true });
    expect(original.snap.profiles).toMatchObject({ names: ['Last setup'], active: null, unsaved: true });
    expect(original.snap.approvedModels).toHaveLength(2);
    original.session.saveProfile('Person A');
    original.session.saveProfile('Spare');
    expect(original.snap.profiles.names).toEqual(['Last setup', 'Person A', 'Spare']);
    expect(original.session.deleteAllProfiles()).toEqual({ ok: true });
    expect(original.snap.profiles.names).toEqual([]);
  });
});

describe('automatic last setup', () => {
  it('keeps the approved setup across a page refresh without pressing Save, and it still needs a re-check', () => {
    const { storage, store } = storeFor();
    const h = new Harness({ profiles: store });
    h.setUpToCommunication();
    expect(store.list().profiles.map((profile) => profile.name)).toEqual(['Last setup']);
    expect(h.snap.profiles.active).toBeNull();
    const refreshed = new Harness({ profiles: storeFor(storage).store });
    expect(refreshed.snap.approvedModels).toEqual([]);
    refreshed.session.setCamera('running');
    expect(refreshed.session.restoreProfile('Last setup')).toBe(true);
    refreshed.run(10_500);
    expect(refreshed.snap.approvedModels).toEqual([]);
  });

  it('follows scan speed changes and never stores the message', () => {
    const { storage, store } = storeFor();
    const h = new Harness({ profiles: store });
    h.setUpToCommunication();
    h.selectByGesture('slower');
    const saved = store.get('Last setup')!;
    expect(saved.scanIntervalMs).toBe(h.snap.scan!.intervalMs);
    expect(storage.data.get(PROFILE_KEY)).not.toMatch(/"message"|lastSpoken|heldOut|negative|frame|timestamp/);
  });

  it('does not disturb input when storage is blocked', () => {
    const h = new Harness({ profiles: createLocalProfileStore(() => null) });
    h.setUpToCommunication();
    expect(h.snap.approvedModels.length).toBeGreaterThan(0);
  });
});

describe('quick continue', () => {
  it('autosave keeps only summary resting numbers, and Continue skips the rest check using them', () => {
    const { storage, store } = storeFor();
    const h = new Harness({ profiles: store });
    h.setUpToCommunication();
    const saved = store.get('Last setup')!;
    expect(Object.keys(saved.baseline!).sort()).toEqual(['durationMs', 'samples', 'statistics']);
    expect(Object.keys(Object.values(saved.baseline!.statistics)[0]!).sort()).toEqual(['center', 'high', 'low', 'noise']);

    const fresh = new Harness({ profiles: storeFor(storage).store });
    fresh.session.setCamera('running');
    expect(fresh.session.restoreProfile('Last setup', true)).toBe(true);
    expect(fresh.snap.stage).toBe('mapping-confirm');
    expect(fresh.snap.approvedModels).toEqual([]);
    fresh.selectByGesture('approve-mapping');
    expect(fresh.snap.stage).toBe('practice');
    expect(fresh.snap.approvedModels).toHaveLength(1);
  });

  it('rejects a malformed saved baseline and still restores older profiles that have none', () => {
    const { store } = storeFor();
    const h = new Harness({ profiles: store });
    h.setUpToCommunication();
    const saved = store.get('Last setup')!;
    expect(parseProfile({ ...saved, baseline: { ...saved.baseline, statistics: {} } }).ok).toBe(false);
    const { baseline: _omitted, ...older } = saved;
    expect(parseProfile(older).ok).toBe(true);
  });

  function quickOn(storage: ReturnType<typeof createMemoryStorage>, rest: Values = REST): Harness {
    const h = new Harness({ profiles: storeFor(storage).store });
    h.session.setCamera('running');
    expect(h.session.restoreProfile('Person A', true)).toBe(true);
    h.run(10_500, rest);
    return h;
  }

  it('skips the movement re-checks: rest, then straight to approving the saved controls, still unarmed until approved', () => {
    const { storage } = savedPersonA();
    const h = quickOn(storage);
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.cycles.at(-1)).toMatchObject({ source: 'restored', quick: true, heldOut: [], negative: null, outcome: 'verified' });
    h.selectByGesture('approve-mapping');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels).toHaveLength(2);
    expect(h.snap.cycles.at(-1)!.outcome).toBe('approved');
  });

  it('claims no checks: the evidence shows nothing passed or measured for a quick restore', () => {
    const { storage } = savedPersonA();
    const h = quickOn(storage);
    h.selectByGesture('approve-mapping');
    h.stepTo('finish-practice');
    for (const item of h.snap.evidence) {
      expect(item.checks).toEqual({ passed: 0, total: 0 });
      expect(item.everyday.windows).toBe(0);
    }
  });

  it('still refuses when today\'s rest does not fit the saved thresholds', () => {
    const { storage } = savedPersonA();
    const h = quickOn(storage, BROW);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.approvedModels).toEqual([]);
  });
});

describe('saving a profile: guards (R7)', () => {
  it('refuses to save during recalibration capture', () => {
    const { original } = savedPersonA();
    original.stepTo('recalibrate');
    original.selectByGesture('start-recalibration');
    expect(original.snap.stage).toBe('baseline');
    expect(original.session.saveProfile('Mid')).toMatchObject({ ok: false });
  });

  it('marks the setup unsaved after a scan speed change', () => {
    const h = new Harness({ profiles: storeFor().store });
    h.setUpToCommunication();
    expect(h.session.saveProfile('One')).toEqual({ ok: true });
    expect(h.snap.profiles.unsaved).toBe(false);
    h.selectByGesture('slower');
    expect(h.snap.profiles.unsaved).toBe(true);
  });
});

describe('restoring a profile (R7)', () => {
  it('re-checks a two-movement profile while disarmed and arms only after approval', () => {
    const { storage } = savedPersonA();
    const h = restoreOn(storage);
    expect(h.snap.stage).toBe('baseline');
    expect(h.snap.restoring).toBe('Person A');
    expect(h.snap.approvedModels).toEqual([]);
    h.session.selectTarget('phrase:0');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.phrases[0]).toBe('Yes'); // saved phrases apply only on approval

    recheck(h);
    expect(h.snap.stage).toBe('comfort');
    const cycle = h.snap.cycles.at(-1)!;
    expect(cycle).toMatchObject({ source: 'restored', profile: 'Person A', training: null, outcome: 'verified' });
    expect(cycle.heldOut.map((attempt) => [attempt.kind, attempt.expected, attempt.passed])).toEqual([
      ['recheck', BROW_LABEL, true], ['recheck', BROW_LABEL, true], ['recheck', 'Open mouth', true], ['recheck', 'Open mouth', true],
    ]);
    expect(cycle.negative).toMatchObject({ passed: true, eventCount: 0 });
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['comfortable', 'another-movement', 'reject-profile']);
    expect(h.snap.approvedModels).toEqual([]);

    h.selectByGesture('comfortable', MOUTH); // any re-checked movement drives setup choices
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.pendingMapping?.id).toBe('saved');
    expect(h.snap.pendingMapping?.label).toMatch(/^Saved controls: Raise left outer eyebrow selects · Open mouth moves next/);
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['choose-different', 'approve-mapping', 'reject-profile']);
    h.selectByGesture('approve-mapping', BROW, 60_000, 600, 0);
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.runtime?.armed).toBe(false);
    expect(h.snap.restoring).toBeNull();
    expect(h.snap.approvedModels.map((model) => model.label)).toEqual([BROW_LABEL, 'Open mouth']);
    expect(h.snap.scanMode).toBe('step');
    expect(h.snap.phrases[0]).toBe('Hello');
    expect(h.snap.scan?.intervalMs).toBe(2_500);
    expect(h.snap.profiles).toMatchObject({ active: 'Person A', unsaved: false });
    expect(h.snap.evidence.map((item) => item.effort)).toEqual(['unknown', 'unknown']); // effort is not saved in v1 profiles
    expect(h.snap.scan?.targets.map((target) => target.id)).not.toContain('use-previous');
    h.run(600);
    h.stepTo('finish-practice');
    h.stepTo('phrase:0');
    expect(h.snap.message).toEqual(['Hello']);
    // Today's rest becomes the approved baseline, so adding a movement later still works.
    h.stepTo('add-movement');
    expect(h.snap.stage).toBe('choose');
  });

  it('Choose different controls offers proposals for the restored set and still needs approval', () => {
    const { storage } = savedPersonA();
    const h = restoreOn(storage);
    recheck(h);
    h.selectByGesture('comfortable');
    h.selectByGesture('choose-different');
    expect(h.snap.stage).toBe('mapping');
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['map:0', 'map:1', 'map:2', 'map:3', 'reject-profile']);
    h.selectByGesture('map:2');
    h.selectByGesture('approve-mapping');
    expect(h.snap.scanMode).toBe('auto');
    expect(h.snap.profiles.unsaved).toBe(true);
  });

  it.each(['mapping', 'mapping-confirm'] as const)('“Do not use this profile” works by gesture in %s and applies nothing', (stage) => {
    const { storage } = savedPersonA();
    const h = restoreOn(storage);
    recheck(h);
    h.selectByGesture('comfortable');
    if (stage === 'mapping') h.selectByGesture('choose-different');
    expect(h.snap.stage).toBe(stage);
    h.selectByGesture('reject-profile');
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.title).toBe('Profile not used');
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.restoring).toBeNull();
    expect(h.snap.phrases[0]).toBe('Yes');
    expect(h.snap.cycles.at(-1)!.outcome).toBe('rejected');
  });

  it('the comfort stage offers a gesture exit and a button exit', () => {
    const { storage } = savedPersonA();
    const gesture = restoreOn(storage);
    recheck(gesture);
    gesture.selectByGesture('reject-profile');
    expect(gesture.snap.failure?.title).toBe('Profile not used');
    const button = restoreOn(storage);
    recheck(button);
    button.session.decide('reject-profile');
    expect(button.snap.failure?.title).toBe('Profile not used');
    expect(button.snap.approvedModels).toEqual([]);
  });

  it('fails honestly when today\'s rest does not fit a saved movement, keeping the rest usable', () => {
    const { storage } = savedPersonA();
    const h = restoreOn(storage);
    h.run(10_500, { browOuterUpLeft: 0.45 });
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.kind).toBe('profile-mismatch');
    expect(h.snap.failure?.reasons[0]).toMatch(/“Raise left outer eyebrow” reads differently at rest/);
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['another-movement']);
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.restoring).toBeNull();
    h.session.decide('another-movement');
    expect(h.snap.stage).toBe('choose');
  });

  it('a saved movement that fails its re-check fails the restore', () => {
    const { storage } = savedPersonA();
    const h = restoreOn(storage);
    h.run(10_500);
    h.followPrompts((snap) => snap.stage !== 'verify', () => REST);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.title).toBe('“Raise left outer eyebrow” did not pass its re-check');
    expect(h.snap.cycles.at(-1)!.outcome).toBe('failed');
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.decisions.map((decision) => decision.id)).not.toContain('record-again');
  });

  it('an accidental activation in the everyday check fails the restore', () => {
    const { storage } = savedPersonA();
    const h = restoreOn(storage);
    recheck(h, (t) => (t % 4_000 < 800 ? MOUTH : REST));
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.cycles.at(-1)!.negative?.passed).toBe(false);
    expect(h.snap.approvedModels).toEqual([]);
  });

  it('cancel and assisted input clear the restore without applying anything', () => {
    const { storage } = savedPersonA();
    const cancelled = restoreOn(storage);
    cancelled.run(3_000);
    cancelled.session.cancel();
    expect(cancelled.snap.restoring).toBeNull();
    expect(cancelled.snap.approvedModels).toEqual([]);
    const assisted = restoreOn(storage);
    assisted.run(10_500);
    assisted.session.useAssisted();
    expect(assisted.snap.restoring).toBeNull();
    expect(assisted.snap.inputMode).toBe('assisted');
    expect(assisted.snap.approvedModels).toEqual([]);
    expect(assisted.snap.phrases[0]).toBe('Yes');
  });

  it('refuses without a camera, with an approved setup, for a missing profile, or with storage blocked', () => {
    const { storage, original } = savedPersonA();
    const noCamera = new Harness({ profiles: storeFor(storage).store });
    expect(noCamera.session.restoreProfile('Person A')).toBe(false);
    expect(noCamera.snap.announcement).toMatch(/Start the camera/);
    expect(original.session.restoreProfile('Person A')).toBe(false);
    const missing = new Harness({ profiles: storeFor(storage).store });
    missing.session.setCamera('running');
    expect(missing.session.restoreProfile('Nobody')).toBe(false);
    expect(missing.snap.stage).toBe('welcome');
    const blocked = new Harness({ profiles: createLocalProfileStore(() => { throw new Error('SecurityError'); }) });
    blocked.session.setCamera('running');
    expect(blocked.snap.profiles.available).toBe(false);
    expect(blocked.session.restoreProfile('Person A')).toBe(false);
    expect(blocked.snap.announcement).toMatch(/not available in this browser/);
  });

  it('keeps the profile read at restore time even if it is deleted meanwhile', () => {
    const { storage } = savedPersonA();
    const h = restoreOn(storage);
    storeFor(storage).store.remove('Person A');
    recheck(h);
    h.selectByGesture('comfortable');
    h.selectByGesture('approve-mapping');
    expect(h.snap.approvedModels).toHaveLength(2);
    expect(h.snap.profiles.names).toEqual(['Last setup']);
  });

  it('re-checks an unmapped saved movement exactly once', () => {
    const { storage } = savedPersonA();
    const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
    const profile = raw.profiles.find((entry: { name: string }) => entry.name === 'Person A');
    const browId = profile.models.find((model: { label: string }) => model.label === BROW_LABEL).id;
    profile.mapping.assignments = { [browId]: 'select' };
    expect(parseProfile(profile).ok).toBe(true);
    storage.setItem(PROFILE_KEY, JSON.stringify(raw));
    const h = restoreOn(storage);
    recheck(h);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.cycles.at(-1)!.heldOut.map((attempt) => attempt.expected)).toEqual([BROW_LABEL, BROW_LABEL, 'Open mouth']);
  });

  it('Choose another movement from restore comfort starts a normal setup that can be approved', () => {
    const { storage } = savedPersonA();
    const h = restoreOn(storage);
    recheck(h);
    h.selectByGesture('another-movement');
    expect(h.snap.stage).toBe('choose');
    expect(h.snap.restoring).toBeNull();
    h.session.chooseMovement(OPEN_MOUTH);
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', MOUTH);
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.cycles.at(-1)!.source).toBe('trained');
    h.selectByGesture('approve-comfortable', MOUTH);
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels.map((model) => model.label)).toEqual(['Open mouth']);
  });

  it('fails as a mismatch when brief resting spikes leave a saved movement\'s neutral zone', () => {
    const { storage } = savedPersonA();
    const brow = JSON.parse(storage.data.get(PROFILE_KEY)!).profiles[0].models.find((model: { label: string }) => model.label === BROW_LABEL);
    const h = restoreOn(storage);
    const spike = brow.baselineCenter + brow.releaseThreshold * 1.6;
    h.run(10_500, (t) => (t % 2_000 < 300 ? { browOuterUpLeft: spike } : REST));
    expect(Math.abs(h.snap.baseline!.statistics.browOuterUpLeft.center - brow.baselineCenter)).toBeLessThan(brow.releaseThreshold);
    expect(h.snap.failure?.kind).toBe('profile-mismatch');
  });

  it('after a restore, Keep current setup from Add a movement keeps today\'s rest', () => {
    const { storage } = savedPersonA();
    const h = restoreOn(storage);
    recheck(h);
    h.selectByGesture('comfortable');
    h.selectByGesture('approve-mapping');
    h.run(600);
    h.stepTo('finish-practice');
    h.stepTo('add-movement');
    expect(h.snap.stage).toBe('choose');
    h.selectByGesture('keep-current');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.baseline).not.toBeNull();
  });

  it('re-approving the saved controls through Choose different controls is not a change', () => {
    const { storage } = savedPersonA();
    // Store the same controls with their keys in reverse order: order must not count as a change.
    const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
    const assignments = raw.profiles[0].mapping.assignments;
    raw.profiles[0].mapping.assignments = Object.fromEntries(Object.entries(assignments).reverse());
    storage.setItem(PROFILE_KEY, JSON.stringify(raw));
    const h = restoreOn(storage);
    recheck(h);
    h.selectByGesture('comfortable');
    h.selectByGesture('choose-different');
    h.selectByGesture('map:0'); // the same controls as saved: brow selects, mouth moves next
    h.selectByGesture('approve-mapping');
    expect(h.snap.profiles).toMatchObject({ active: 'Person A', unsaved: false });
  });
});
