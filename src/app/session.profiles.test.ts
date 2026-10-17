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
    expect(original.snap.profiles).toMatchObject({ names: ['Person A'], active: 'Person A', unsaved: false });
    const raw = storage.data.get(PROFILE_KEY)!;
    expect(original.snap.message).toEqual(['I need water']);
    expect(raw).not.toMatch(/"message"|lastSpoken/);
    expect(raw).not.toMatch(/statistics|heldOut|negative|frame/);
    const saved = JSON.parse(raw).profiles[0];
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
    expect(original.snap.profiles).toMatchObject({ names: [], active: null, unsaved: true });
    expect(original.snap.approvedModels).toHaveLength(2);
    original.session.saveProfile('Person A');
    original.session.saveProfile('Spare');
    expect(original.session.deleteAllProfiles()).toEqual({ ok: true });
    expect(original.snap.profiles.names).toEqual([]);
  });
});

const MINUTE = 60_000;

/** Brow at t0, then (after `gapMs`) the mouth is added (which cross-checks the brow), saved as "Person A". */
function savedWithGap(gapMs: number) {
  const { storage, store } = storeFor();
  const h = new Harness({ profiles: store });
  h.setUpToCommunication();
  h.now += gapMs;
  h.run(2_000);
  h.addMovement(OPEN_MOUTH, perform);
  h.selectByGesture('comfortable');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  h.stepTo('finish-practice');
  expect(h.session.saveProfile('Person A')).toEqual({ ok: true });
  return { storage, store, h };
}

function approveSaved(h: Harness): void {
  h.selectByGesture('approve-mapping', BROW, 60_000, 600, 0);
  expect(h.snap.stage).toBe('practice');
}

/** A full restore after the hour with the exact clock times of its rest check and movement checks; then Back to start. */
function withKnownTimes() {
  const { storage, original: h } = savedPersonA();
  h.session.returnToStart();
  h.now += 61 * MINUTE;
  h.session.restoreProfile('Person A');
  while (h.snap.stage === 'baseline') h.run(1);
  const restAt = h.now;
  h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
  while (h.snap.stage === 'negative') h.run(1, HEAD_WOBBLE);
  const movedAt = h.now;
  expect(h.snap.stage).toBe('comfort');
  h.selectByGesture('comfortable', MOUTH);
  approveSaved(h);
  expect(h.session.returnToStart()).toBe(true);
  return { h, storage, restAt, movedAt };
}

describe('back to start after saving', () => {
  it('ends the session in place, keeps the camera, and clears the setup', () => {
    const { original: h } = savedPersonA();
    expect(h.session.returnToStart()).toBe(true);
    expect(h.snap).toMatchObject({ stage: 'welcome', camera: 'running', approvedModels: [], mapping: null, scan: null,
      message: [], cycles: [], inputMode: 'gesture', profiles: { names: ['Person A'], active: null, unsaved: false } });
    expect(h.snap.phrases[0]).toBe('Yes');
  });

  it('refuses while the current setup is unsaved or changed since saving', () => {
    const { store } = storeFor();
    const h = new Harness({ profiles: store });
    h.setUpToCommunication();
    expect(h.session.returnToStart()).toBe(false);
    expect(h.session.saveProfile('Sam')).toEqual({ ok: true });
    h.selectByGesture('slower');
    expect(h.snap.profiles.unsaved).toBe(true);
    expect(h.session.returnToStart()).toBe(false);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.approvedModels).toHaveLength(1);
  });
});

describe('restoring within an hour of the checks (R14)', () => {
  it('skips the rest check and movement re-checks but still needs approval, disarmed until neutral', () => {
    const { original: h } = savedPersonA();
    h.session.returnToStart();
    h.now += 30 * MINUTE;
    expect(h.session.restoreProfile('Person A')).toBe(true);
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.pendingMapping?.id).toBe('saved');
    expect(h.snap.decisions.map((decision) => decision.id)).toEqual(['choose-different', 'approve-mapping', 'reject-profile']);
    expect(h.snap.approvedModels).toEqual([]);
    expect(h.snap.runtime?.armed).not.toBe(true);
    h.session.selectTarget('phrase:0');
    expect(h.snap.message).toEqual([]);
    const cycle = h.snap.cycles.at(-1)!;
    expect(cycle).toMatchObject({ source: 'restored', heldOut: [], negative: null, outcome: 'verified' });
    expect(cycle.movement).toMatch(/no attempts or everyday check this time/);
    approveSaved(h);
    expect(h.snap.approvedModels.map((model) => model.label)).toEqual([BROW_LABEL, 'Open mouth']);
    expect(h.snap.phrases[0]).toBe('Hello');
    expect(h.snap.profiles).toMatchObject({ active: 'Person A', unsaved: false });
  });

  it('repeats everything at exactly one hour', () => {
    const { original: h } = savedPersonA();
    h.session.returnToStart();
    h.now += 60 * MINUTE;
    h.session.restoreProfile('Person A');
    expect(h.snap.stage).toBe('baseline');
    recheck(h);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.cycles.at(-1)!.heldOut).toHaveLength(4);
  });

  it('repeats an old rest check but not movements checked within the hour', () => {
    const { h } = savedWithGap(50 * MINUTE); // rest at t0; both movements checked at t0+50 (mouth trained, brow cross-checked)
    h.session.returnToStart();
    h.now += 15 * MINUTE; // rest is 65 minutes old, movements about 15
    h.session.restoreProfile('Person A');
    expect(h.snap.stage).toBe('baseline');
    h.run(10_500);
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.cycles.at(-1)!.heldOut).toEqual([]);
    approveSaved(h);
  });

  it('a skipped check keeps its original time, so it is repeated an hour after it really ran', () => {
    const { h } = savedWithGap(50 * MINUTE);
    h.session.returnToStart();
    h.now += 15 * MINUTE;
    h.session.restoreProfile('Person A');
    h.run(10_500); // new rest check at about t0+65; movements skipped, still dated t0+50
    approveSaved(h);
    expect(h.session.returnToStart()).toBe(true);
    h.now += 45 * MINUTE; // rest about 45 minutes old, movements about 61
    h.session.restoreProfile('Person A');
    expect(h.snap.stage).toBe('verify');
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    expect(h.snap.stage).toBe('negative');
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.cycles.at(-1)!.heldOut).toHaveLength(4);
  });

  it('forgets the recent checks after another rest check or for another profile', () => {
    const { original: h } = savedPersonA();
    expect(h.session.saveProfile('Person B')).toEqual({ ok: true });
    h.session.returnToStart();
    h.session.restoreProfile('Person A'); // another profile than the one just left
    expect(h.snap.stage).toBe('baseline');

    const { original: other } = savedPersonA();
    other.session.returnToStart();
    other.session.startBaseline(); // someone else's rest check in between
    other.session.cancel();
    expect(other.snap.stage).toBe('setup-failed');
    other.session.restoreProfile('Person A');
    expect(other.snap.stage).toBe('baseline');
  });

  it('a movement-only reuse needs the same profile: another name re-checks every movement after its rest', () => {
    const { original: h } = savedPersonA();
    expect(h.session.saveProfile('Person B')).toEqual({ ok: true });
    h.session.returnToStart();
    h.session.restoreProfile('Person A');
    h.run(10_500);
    expect(h.snap.stage).toBe('verify');
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    expect(h.snap.cycles.at(-1)!.heldOut).toHaveLength(4);
  });

  it('assisted input in between forgets the recent checks', () => {
    const { original: h } = savedPersonA();
    h.session.returnToStart();
    h.session.useAssisted();
    h.session.selectTarget('setup-gesture');
    expect(h.snap.stage).toBe('welcome');
    h.session.restoreProfile('Person A');
    expect(h.snap.stage).toBe('baseline');
  });

  it('a reused rest that does not fit a changed saved movement still fails as a mismatch', () => {
    const { storage, original: h } = savedPersonA();
    h.session.returnToStart();
    const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
    raw.profiles[0].models[0].baselineCenter += 1;
    storage.setItem(PROFILE_KEY, JSON.stringify(raw));
    h.session.restoreProfile('Person A');
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.failure?.kind).toBe('profile-mismatch');
  });

  it('the hour is exact: 59:59.999 after the rest check skips, 60:00 repeats', () => {
    const early = withKnownTimes();
    early.h.now = early.restAt + 60 * MINUTE - 1;
    early.h.session.restoreProfile('Person A');
    expect(early.h.snap.stage).toBe('mapping-confirm');
    const late = withKnownTimes();
    late.h.now = late.restAt + 60 * MINUTE;
    late.h.session.restoreProfile('Person A');
    expect(late.h.snap.stage).toBe('baseline');
  });

  it('a reused rest check keeps its original time', () => {
    const { h, restAt } = withKnownTimes();
    h.now = restAt + 30 * MINUTE;
    h.session.restoreProfile('Person A');
    approveSaved(h);
    expect(h.session.returnToStart()).toBe(true);
    h.now = restAt + 61 * MINUTE;
    h.session.restoreProfile('Person A');
    expect(h.snap.stage).toBe('baseline');
  });

  it('stamps only the movement re-checked in a partial restore; the skipped one is due an hour after its real check', () => {
    const { h, storage, movedAt } = withKnownTimes();
    // Edit the saved mouth label so only that movement no longer matches a recent check.
    const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
    const mouth = raw.profiles[0].models.find((model: { feature: string }) => model.feature === 'jawOpen');
    mouth.label = 'Open mouth wide';
    storage.setItem(PROFILE_KEY, JSON.stringify(raw));
    const wide = (label: string | null): Values => (label?.startsWith('Open mouth') ? MOUTH : perform(label));
    h.now += 5 * MINUTE;
    h.session.restoreProfile('Person A');
    expect(h.snap.stage).toBe('verify'); // rest reused, brow skipped, mouth due
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => wide(snap.capture?.movement ?? null));
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.cycles.at(-1)!.heldOut.map((attempt) => attempt.expected)).toEqual(['Open mouth wide', 'Open mouth wide']);
    h.selectByGesture('comfortable', MOUTH);
    approveSaved(h);
    expect(h.session.returnToStart()).toBe(true);
    h.now = movedAt + 60 * MINUTE + 1; // brow's real check is now an hour old; the mouth's is not
    h.session.restoreProfile('Person A');
    h.run(10_500);
    expect(h.snap.stage).toBe('verify');
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => wide(snap.capture?.movement ?? null));
    expect(h.snap.cycles.at(-1)!.heldOut.map((attempt) => attempt.expected)).toEqual([BROW_LABEL, BROW_LABEL]);
  });

  it('a new page (reload) always repeats the checks', () => {
    const { storage } = savedPersonA();
    expect(restoreOn(storage).snap.stage).toBe('baseline');
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
    expect(h.snap.profiles.names).toEqual([]);
  });

  it('re-checks an unmapped saved movement exactly once', () => {
    const { storage } = savedPersonA();
    const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
    const profile = raw.profiles[0];
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
    h.selectByGesture('comfortable', MOUTH);
    h.selectByGesture('map:0', MOUTH);
    h.selectByGesture('approve-mapping', MOUTH);
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
