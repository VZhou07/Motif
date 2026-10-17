import { describe, expect, it, vi } from 'vitest';
import { createLocalProfileStore, createMemoryStorage, parseProfile, PROFILE_KEY, type ProfileStore, type StorageLike, type StoredProfile } from './profiles';
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
    fresh.now = h.now + 5 * MINUTE; // a reload within the hour (R17)
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

  function quickOn(storage: ReturnType<typeof createMemoryStorage>, rest: Values = REST, now = 0): Harness {
    const h = new Harness({ profiles: storeFor(storage).store });
    h.now = now; // R17: same wall-clock time as the original page, so its checks are within the hour
    h.session.setCamera('running');
    expect(h.session.restoreProfile('Person A', true)).toBe(true);
    h.run(10_500, rest);
    return h;
  }

  it('skips the movement re-checks: rest, then straight to approving the saved controls, still unarmed until approved', () => {
    const { storage, original } = savedPersonA();
    const h = quickOn(storage, REST, original.now);
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.cycles.at(-1)).toMatchObject({ source: 'restored', quick: true, heldOut: [], negative: null, outcome: 'verified' });
    h.selectByGesture('approve-mapping');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels).toHaveLength(2);
    expect(h.snap.cycles.at(-1)!.outcome).toBe('approved');
  });

  it('claims no checks: the evidence shows nothing passed or measured for a quick restore', () => {
    const { storage, original } = savedPersonA();
    const h = quickOn(storage, REST, original.now);
    h.selectByGesture('approve-mapping');
    h.stepTo('finish-practice');
    for (const item of h.snap.evidence) {
      expect(item.checks).toEqual({ passed: 0, total: 0 });
      expect(item.everyday.windows).toBe(0);
    }
  });

  it('still refuses when today\'s rest does not fit the saved thresholds', () => {
    const { storage, original } = savedPersonA();
    const h = quickOn(storage, BROW, original.now);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.approvedModels).toEqual([]);
  });
});

describe('one-movement saved setup: confirm screen', () => {
  it('offers Choose another movement instead of a one-option controls page, and approves nothing', () => {
    const { storage, store } = storeFor();
    const first = new Harness({ profiles: store });
    first.now = 10 * 60 * 60_000; // a real wall-clock time, so the rest check counts as recent
    first.setUpToCommunication();
    const h = new Harness({ profiles: storeFor(storage).store });
    h.now = first.now + 60_000;
    h.session.setCamera('running');
    expect(h.session.restoreProfile('Last setup', true)).toBe(true);
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['another-movement', 'approve-mapping']);
    h.selectByGesture('another-movement');
    expect(h.snap.stage).toBe('choose');
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.restoring).toBeNull();
    expect(h.snap.pendingMapping).toBeNull();
  });
});

const MINUTE = 60_000;
const LAST = 'Last setup';

function lastSetup(store: ProfileStore): StoredProfile { return store.get(LAST)!; }

/** Rewrites the stored Last setup (test-only tampering of saved data). */
function editLast(storage: ReturnType<typeof createMemoryStorage>, edit: (profile: StoredProfile) => void): void {
  const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
  edit(raw.profiles.find((profile: StoredProfile) => profile.name === LAST));
  storage.setItem(PROFILE_KEY, JSON.stringify(raw));
}

/** Brow and mouth approved (the mouth added `gapMs` after the brow, cross-checking it), autosaved, then Back to start. */
function twoAndBack(gapMs = 0) {
  const { storage, store } = storeFor();
  const h = new Harness({ profiles: store });
  h.now = 10 * 60 * MINUTE; // wall-clock times well above zero, so "two hours ago" is a valid stored time
  h.setUpToCommunication();
  h.now += gapMs;
  h.run(2_000);
  h.addMovement(OPEN_MOUTH, perform);
  h.selectByGesture('comfortable');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  h.stepTo('finish-practice');
  expect(h.session.returnToStart()).toBe(true);
  return { h, storage, store };
}

function approveSaved(h: Harness): void {
  h.selectByGesture('approve-mapping', BROW, 60_000, 600, 0);
  expect(h.snap.stage).toBe('practice');
}

function finishRechecks(h: Harness, movement = perform): void {
  h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => movement(snap.capture?.movement ?? null));
  if (h.snap.stage === 'negative') h.run(11_000, HEAD_WOBBLE);
}

describe('back to start (R15/R17)', () => {
  it('ends the session in place, keeps the camera, and keeps the automatic Last setup', () => {
    const { h } = twoAndBack();
    expect(h.snap).toMatchObject({ stage: 'welcome', camera: 'running', approvedModels: [], mapping: null, scan: null,
      message: [], cycles: [], inputMode: 'gesture', profiles: { names: [LAST] } });
    expect(h.snap.phrases[0]).toBe('Yes');
  });

  it('is refused when this browser cannot keep the setup', () => {
    const h = new Harness({ profiles: createLocalProfileStore(() => null) });
    h.setUpToCommunication();
    expect(h.session.returnToStart()).toBe(false);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.announcement).toMatch(/could not keep your setup/);
  });
});

describe('back to start from assisted input (R16)', () => {
  function assisted(): Harness {
    const h = new Harness({ profiles: storeFor().store });
    h.session.setPhrase(0, 'Hello');
    h.session.useAssisted();
    expect(h.snap).toMatchObject({ stage: 'communication', inputMode: 'assisted' });
    return h;
  }

  it('returns to the start screen, clears the message, keeps phrases, and Space or a target no longer acts', () => {
    const h = assisted();
    h.session.selectTarget('phrase:1');
    expect(h.snap.message).toHaveLength(1);
    const cancel = vi.spyOn(h.speech, 'cancel');
    expect(h.session.returnToStart()).toBe(true);
    expect(cancel).toHaveBeenCalled();
    expect(h.snap).toMatchObject({ stage: 'welcome', inputMode: 'gesture', message: [], lastSpoken: null, scan: null });
    expect(h.snap.phrases[0]).toBe('Hello');
    expect(h.snap.announcement).toBe('Back at the start screen. Nothing was saved.');
    h.session.switchPress(h.now);
    h.session.selectTarget('phrase:0');
    expect(h.snap.message).toEqual([]);
  });

  it('is refused during assisted practice', () => {
    const h = assisted();
    h.session.selectTarget('practice');
    expect(h.snap.stage).toBe('practice');
    expect(h.session.returnToStart()).toBe(false);
    expect(h.snap.stage).toBe('practice');
  });
});

describe('Continue within an hour of the checks (R17)', () => {
  it.each([undefined, 2])('rechecks legacy or incompatible policy %s without deleting the profile', (policyVersion) => {
    const { h, storage, store } = twoAndBack();
    editLast(storage, (profile) => {
      if (policyVersion === undefined) delete profile.checks!.policyVersion;
      else profile.checks!.policyVersion = policyVersion;
    });
    expect(store.get(LAST)?.models).toHaveLength(2);
    h.now += MINUTE;
    expect(h.session.restoreProfile(LAST, true)).toBe(true);
    expect(h.snap.stage).toBe('baseline');
    expect(h.snap.approvedModels).toEqual([]);
    h.run(10_500);
    expect(h.snap.stage).toBe('verify');
    finishRechecks(h);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.cycles.at(-1)?.heldOut).toHaveLength(4);
    expect(h.snap.cycles.at(-1)?.negative?.passed).toBe(true);
    expect(h.snap.approvedModels).toEqual([]);
    h.selectByGesture('comfortable');
    approveSaved(h);
    expect(lastSetup(store).checks?.policyVersion).toBe(1);
  });

  it('an explicit Save says that check times are stored', () => {
    const h = new Harness({ profiles: storeFor().store });
    h.setUpToCommunication();
    expect(h.session.saveProfile('Sam')).toEqual({ ok: true });
    expect(h.snap.announcement).toMatch(/when your checks last passed/);
  });

  it('stores only times with the setup, with ids of its own movements', () => {
    const { store, storage } = twoAndBack();
    const saved = lastSetup(store);
    expect(Object.keys(saved.checks!).sort()).toEqual(['movementAt', 'policyVersion', 'restAt']);
    expect(Object.keys(saved.checks!.movementAt).sort()).toEqual(saved.models.map((model) => model.id).sort());
    expect(storage.data.get(PROFILE_KEY)).not.toMatch(/heldOut|negative|frame|timestamp|"message"/);
    expect(parseProfile({ ...saved, checks: { ...saved.checks, movementAt: { other: 5 } } }).ok).toBe(false);
    expect(parseProfile({ ...saved, checks: { ...saved.checks, restAt: Number.NaN } }).ok).toBe(false);
    expect(parseProfile({ ...saved, checks: { ...saved.checks, extra: 1 } }).ok).toBe(false);
    expect(parseProfile({ ...saved, checks: { ...saved.checks, restAt: 0 } }).ok).toBe(false);
  });

  it('skips the rest check and movement checks after Back to start, but still needs approval, disarmed until neutral', () => {
    const { h } = twoAndBack();
    h.now += 30 * MINUTE;
    expect(h.session.restoreProfile(LAST, true)).toBe(true);
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['choose-different', 'approve-mapping']);
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.runtime?.armed).not.toBe(true);
    h.session.selectTarget('phrase:0');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.cycles.at(-1)).toMatchObject({ source: 'restored', quick: true, heldOut: [], negative: null, outcome: 'verified' });
    expect(h.snap.cycles.at(-1)!.movement).toMatch(/no attempts or everyday check this time/);
    approveSaved(h);
    expect(h.snap.approvedModels.map((model) => model.label)).toEqual([BROW_LABEL, 'Open mouth']);
  });

  it('also skips them after a page reload within the hour', () => {
    const { h, storage } = twoAndBack();
    const fresh = new Harness({ profiles: storeFor(storage).store });
    fresh.now = h.now + 20 * MINUTE;
    fresh.session.setCamera('running');
    fresh.session.restoreProfile(LAST, true);
    expect(fresh.snap.stage).toBe('mapping-confirm');
  });

  it('the hour is exact: 59:59.999 after the rest check skips it, 60:00 repeats it', () => {
    const early = twoAndBack();
    early.h.now = lastSetup(early.store).checks!.restAt! + 60 * MINUTE - 1;
    early.h.session.restoreProfile(LAST, true);
    expect(early.h.snap.stage).toBe('mapping-confirm');
    const late = twoAndBack();
    late.h.now = lastSetup(late.store).checks!.restAt! + 60 * MINUTE;
    late.h.session.restoreProfile(LAST, true);
    expect(late.h.snap.stage).toBe('baseline');
  });

  it('repeats an old rest check but not movements checked within the hour', () => {
    const { h } = twoAndBack(50 * MINUTE); // rest at t0; both movements checked at t0+50
    h.now += 15 * MINUTE;
    h.session.restoreProfile(LAST, true);
    expect(h.snap.stage).toBe('baseline');
    h.run(10_500);
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.cycles.at(-1)!.heldOut).toEqual([]);
  });

  it('re-checks only an old movement, then the everyday check; the skipped one keeps its real time', () => {
    const { h, storage, store } = twoAndBack();
    const before = lastSetup(store).checks!;
    const mouthId = lastSetup(store).models.find((model) => model.feature === 'jawOpen')!.id;
    const browId = lastSetup(store).models.find((model) => model.label === BROW_LABEL)!.id;
    const NOW = () => h.now;
    editLast(storage, (profile) => { profile.checks!.movementAt[mouthId] = NOW() - 2 * 60 * MINUTE; });
    h.now += 10 * MINUTE;
    h.session.restoreProfile(LAST, true);
    expect(h.snap.stage).toBe('verify');
    finishRechecks(h);
    expect(h.snap.stage).toBe('comfort');
    const cycle = h.snap.cycles.at(-1)!;
    expect(cycle.heldOut.map((attempt) => attempt.expected)).toEqual(['Open mouth', 'Open mouth']);
    expect(cycle.negative).toMatchObject({ passed: true });
    expect(cycle.movement).toMatch(/1 movement checked within the last hour; not repeated/);
    h.selectByGesture('comfortable', MOUTH);
    approveSaved(h);
    const after = lastSetup(store).checks!;
    expect(after.restAt).toBe(before.restAt);
    expect(after.movementAt[browId]).toBe(before.movementAt[browId]);
    expect(after.movementAt[mouthId]).toBeGreaterThan(h.now - MINUTE);
  });

  it('a skip never refreshes a time, so the checks come back an hour after they really ran', () => {
    const { h, store } = twoAndBack();
    const restAt = lastSetup(store).checks!.restAt!;
    h.now = restAt + 30 * MINUTE;
    h.session.restoreProfile(LAST, true);
    approveSaved(h);
    expect(lastSetup(store).checks!.restAt).toBe(restAt);
    expect(h.session.returnToStart()).toBe(true);
    h.now = restAt + 61 * MINUTE;
    h.session.restoreProfile(LAST, true);
    expect(h.snap.stage).toBe('baseline');
  });

  it('a scan speed change autosaves without refreshing the times', () => {
    const { storage, store } = storeFor();
    const h = new Harness({ profiles: store });
    h.setUpToCommunication();
    const before = lastSetup(store).checks;
    h.now += 10 * MINUTE;
    h.selectByGesture('slower');
    expect(lastSetup(store).scanIntervalMs).toBe(2_500);
    expect(lastSetup(store).checks).toEqual(before);
    expect(storage.data.get(PROFILE_KEY)).toBeTruthy();
  });

  it('Continue and re-check always repeats everything', () => {
    const { h } = twoAndBack();
    h.session.restoreProfile(LAST, false);
    expect(h.snap.stage).toBe('baseline');
    h.run(10_500);
    finishRechecks(h);
    expect(h.snap.cycles.at(-1)!.heldOut).toHaveLength(4);
  });

  it('treats future times, missing times, and a recent rest without saved resting numbers as not recent', () => {
    const future = twoAndBack();
    editLast(future.storage, (profile) => {
      profile.checks!.restAt = future.h.now + 10 * MINUTE;
      for (const id of Object.keys(profile.checks!.movementAt)) profile.checks!.movementAt[id] = future.h.now + 10 * MINUTE;
    });
    future.h.session.restoreProfile(LAST, true);
    expect(future.h.snap.stage).toBe('baseline');
    future.h.run(10_500);
    expect(future.h.snap.stage).toBe('verify');

    const old = twoAndBack();
    editLast(old.storage, (profile) => { delete profile.checks; });
    old.h.session.restoreProfile(LAST, true);
    expect(old.h.snap.stage).toBe('baseline');
    old.h.run(10_500);
    expect(old.h.snap.stage).toBe('verify');

    const noRest = twoAndBack();
    editLast(noRest.storage, (profile) => { delete profile.baseline; });
    noRest.h.session.restoreProfile(LAST, true);
    expect(noRest.h.snap.stage).toBe('baseline');
    noRest.h.run(10_500);
    expect(noRest.h.snap.stage).toBe('mapping-confirm');
  });
});

describe('a failed restore forgets the check times (R17 B1)', () => {
  /** Mouth's stored time made old, so Continue reuses the rest and re-checks only the mouth. */
  function partial() {
    const back = twoAndBack();
    const mouthId = lastSetup(back.store).models.find((model) => model.feature === 'jawOpen')!.id;
    const NOW = () => back.h.now;
    editLast(back.storage, (profile) => { profile.checks!.movementAt[mouthId] = NOW() - 2 * 60 * MINUTE; });
    back.h.session.restoreProfile(LAST, true);
    expect(back.h.snap.stage).toBe('verify');
    return back;
  }

  function nextContinueRunsEverything(h: Harness, store: ProfileStore): void {
    expect(lastSetup(store).checks).toBeUndefined();
    h.session.restoreProfile(LAST, true);
    expect(h.snap.stage).toBe('baseline');
    h.run(10_500);
    finishRechecks(h);
    expect(h.snap.cycles.at(-1)!.heldOut).toHaveLength(4);
  }

  it('after a failed re-check', () => {
    const { h, store } = partial();
    finishRechecks(h, () => REST);
    expect(h.snap.stage).toBe('setup-failed');
    nextContinueRunsEverything(h, store);
  });

  it('after a failed everyday check', () => {
    const { h, store } = partial();
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    expect(h.snap.stage).toBe('negative');
    h.run(1_000);
    h.run(800, MOUTH);
    h.run(11_000);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.kind).toBe('negative');
    nextContinueRunsEverything(h, store);
  });

  it('after a rest that does not fit, and after a cancelled restore', () => {
    const mismatch = twoAndBack();
    mismatch.h.now += 61 * MINUTE;
    mismatch.h.session.restoreProfile(LAST, true);
    mismatch.h.run(10_500, BROW);
    expect(mismatch.h.snap.failure?.kind).toBe('profile-mismatch');
    expect(lastSetup(mismatch.store).checks).toBeUndefined();

    const cancelled = partial();
    cancelled.h.session.cancel();
    expect(cancelled.h.snap.stage).toBe('setup-failed');
    nextContinueRunsEverything(cancelled.h, cancelled.store);
  });

  it('remembers in memory when the times cannot be removed from storage', () => {
    const memory = createMemoryStorage();
    let blocked = false;
    const storage: StorageLike = { getItem: (key) => memory.getItem(key), removeItem: (key) => memory.removeItem(key),
      setItem: (key, value) => { if (blocked) throw new Error('full'); memory.setItem(key, value); } };
    const store = createLocalProfileStore(() => storage);
    const h = new Harness({ profiles: store });
    h.setUpToCommunication();
    // Two movements, so the controls screen (with "Do not use this profile") is reachable from the confirm screen.
    h.run(2_000);
    h.addMovement(OPEN_MOUTH, perform);
    h.selectByGesture('comfortable');
    h.selectByGesture('map:0');
    h.selectByGesture('approve-mapping');
    h.stepTo('finish-practice');
    expect(h.session.returnToStart()).toBe(true);
    blocked = true;
    h.session.restoreProfile(LAST, true);
    expect(h.snap.stage).toBe('mapping-confirm');
    h.session.decide('choose-different'); // "Do not use this profile" lives on the controls screen
    h.session.decide('reject-profile');
    h.session.restoreProfile(LAST, true);
    h.session.cancel();
    expect(lastSetup(store).checks).toBeDefined();
    h.session.restoreProfile(LAST, true);
    expect(h.snap.stage).toBe('baseline');
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
    // "Do not use this profile" is not offered on the confirm screen; it stays on comfort and mapping.
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['choose-different', 'approve-mapping']);
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

  it('“Do not use this profile” works by gesture in mapping and applies nothing', () => {
    const { storage } = savedPersonA();
    const h = restoreOn(storage);
    recheck(h);
    h.selectByGesture('comfortable');
    expect(h.snap.stage).toBe('mapping-confirm');
    h.session.decide('reject-profile'); // not offered on the confirm screen: ignored
    expect(h.snap.stage).toBe('mapping-confirm');
    h.selectByGesture('choose-different');
    expect(h.snap.stage).toBe('mapping');
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
