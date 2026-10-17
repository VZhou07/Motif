import { describe, expect, it } from 'vitest';
import type { GestureModel } from '../domain/types';
import { validateMapping } from './mapping';
import {
  buildProfile, createLocalProfileStore, createMemoryStorage, FEATURE_SCHEMA, MAX_PROFILES, parseProfile, PROFILE_KEY, PROFILE_SCAN,
  type StoredProfile,
} from './profiles';
import { SESSION_LIMITS } from './session';
import { STARTER_PHRASES } from './types';

const brow: GestureModel = { id: 'browOuterUpLeft:1:1', label: 'Raise left outer eyebrow', feature: 'browOuterUpLeft', direction: 1,
  baselineCenter: 0.1, activationThreshold: 0.3, releaseThreshold: 0.15, activationMs: 250, releaseMs: 350 };
const mouth: GestureModel = { ...brow, id: 'jawOpen:1:2', label: 'Open mouth', feature: 'jawOpen' };

function profile(overrides: Partial<StoredProfile> = {}): StoredProfile {
  const mapping = validateMapping([brow, mouth], { [brow.id]: 'select', [mouth.id]: 'next' });
  if (!mapping.ok) throw new Error('fixture mapping invalid');
  const built = buildProfile({ name: 'Person A', models: [brow, mouth], mapping: mapping.value, phrases: STARTER_PHRASES, scanIntervalMs: 2_000 });
  if (!built.ok) throw new Error(built.reasons.join('; '));
  return { ...built.value, ...overrides };
}

/** A JSON round trip, as storage would do it (NaN and Infinity become null). */
const viaJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('profile validation', () => {
  it('copying legacy evidence preserves its missing policy marker', () => {
    const legacy = profile({ checks: { movementAt: { [brow.id]: 123 } } });
    const mapping = validateMapping(legacy.models, legacy.mapping.assignments);
    if (!mapping.ok) throw new Error('fixture mapping');
    const copy = buildProfile({ ...legacy, mapping: mapping.value });
    expect(copy.ok && copy.value.checks?.movementAt[brow.id]).toBe(123);
    expect(copy.ok && Object.hasOwn(copy.value.checks!, 'policyVersion')).toBe(false);
    expect(parseProfile({ ...legacy, checks: { ...legacy.checks, policyVersion: 2 } }).ok).toBe(true);
    expect(parseProfile({ ...legacy, checks: { ...legacy.checks, policyVersion: 0 } }).ok).toBe(false);
    expect(parseProfile({ ...legacy, checks: { ...legacy.checks, policyVersion: '1' } }).ok).toBe(false);
  });

  it('round-trips a valid profile through JSON and keeps only the allowed fields', () => {
    const parsed = parseProfile(viaJson(profile()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.value).sort()).toEqual(['featureSchema', 'mapping', 'models', 'name', 'phrases', 'scanIntervalMs', 'version']);
    expect(parsed.value.featureSchema).toBe(FEATURE_SCHEMA);
    expect(FEATURE_SCHEMA).toContain('winkLeft,winkRight');
    expect(parsed.value.models).toEqual([brow, mouth]);
  });

  it('buildProfile copies only model fields and trims the name', () => {
    const extra = { ...brow, secret: 'frame data' } as GestureModel;
    const mapping = validateMapping([extra], { [brow.id]: 'select' });
    if (!mapping.ok) throw new Error('mapping');
    const built = buildProfile({ name: '  Person B ', models: [extra], mapping: mapping.value, phrases: STARTER_PHRASES, scanIntervalMs: 1_500 });
    expect(built.ok && built.value.name).toBe('Person B');
    expect(built.ok && Object.keys(built.value.models[0]!)).not.toContain('secret');
  });

  const rejects: Array<[string, unknown]> = [
    ['a non-object', 'hello'],
    ['another version', { ...profile(), version: 2 }],
    ['an extra key', { ...profile(), message: ['I need water'] }],
    ['a missing key', (({ phrases: _phrases, ...rest }) => rest)(profile())],
    ['another feature schema', { ...profile(), featureSchema: 'jawOpen' }],
    ['an empty name', { ...profile(), name: ' ' }],
    ['a long name', { ...profile(), name: 'x'.repeat(41) }],
    ['no movements', { ...profile(), models: [] }],
    ['five movements', { ...profile(), models: [brow, mouth, { ...brow, id: 'c', feature: 'cheekPuff' }, { ...brow, id: 'd', feature: 'mouthPucker' }, { ...brow, id: 'e', feature: 'browInnerUp' }] }],
    ['a NaN threshold after JSON', viaJson({ ...profile(), models: [{ ...brow, activationThreshold: Number.NaN }, mouth] })],
    ['an infinite center after JSON', viaJson({ ...profile(), models: [{ ...brow, baselineCenter: Number.POSITIVE_INFINITY }, mouth] })],
    ['activation not above release', { ...profile(), models: [{ ...brow, activationThreshold: 0.15 }, mouth] }],
    ['a zero release', { ...profile(), models: [{ ...brow, releaseThreshold: 0 }, mouth] }],
    ['an unknown feature', { ...profile(), models: [{ ...brow, feature: 'noseWiggle' }, mouth] }],
    ['direction 0', { ...profile(), models: [{ ...brow, direction: 0 }, mouth] }],
    ['a 60 ms dwell (runtime minimum is 100)', { ...profile(), models: [{ ...brow, activationMs: 60 }, mouth] }],
    ['an extra model key', { ...profile(), models: [{ ...brow, frames: [] }, mouth] }],
    ['a long movement label', { ...profile(), models: [{ ...brow, label: 'x'.repeat(61) }, mouth] }],
    ['duplicate ids', { ...profile(), models: [brow, { ...mouth, id: brow.id }], mapping: { assignments: { [brow.id]: 'select' } } }],
    ['the same movement twice', { ...profile(), models: [brow, { ...brow, id: 'other' }], mapping: { assignments: { [brow.id]: 'select', other: 'next' } } }],
    ['a short interval', { ...profile(), scanIntervalMs: 500 }],
    ['a long phrase', { ...profile(), phrases: ['x'.repeat(61), ...STARTER_PHRASES.slice(1)] }],
    ['a padded name', { ...profile(), name: ' Person A' }],
    ['an invalid mapping', { ...profile(), mapping: { assignments: { [brow.id]: 'next' } } }],
    ['a mapping with extra keys', { ...profile(), mapping: { assignments: { [brow.id]: 'select' }, mode: 'auto' } }],
    ['five phrases', { ...profile(), phrases: STARTER_PHRASES.slice(0, 5) }],
    ['an empty phrase', { ...profile(), phrases: ['', ...STARTER_PHRASES.slice(1)] }],
    ['a slow interval', { ...profile(), scanIntervalMs: 6_500 }],
    ['an off-step interval', { ...profile(), scanIntervalMs: 2_250 }],
  ];
  it.each(rejects)('rejects %s', (_name, value) => {
    const parsed = parseProfile(value);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reasons.length).toBeGreaterThan(0);
  });

  it('uses the same scan bounds as the session', () => {
    expect(PROFILE_SCAN).toEqual({ minMs: SESSION_LIMITS.scanMinMs, maxMs: SESSION_LIMITS.scanMaxMs, stepMs: SESSION_LIMITS.scanStepMs });
  });
});

describe('profile store', () => {
  function setup() {
    const storage = createMemoryStorage();
    return { storage, store: createLocalProfileStore(() => storage) };
  }

  it('saves, lists, refuses a duplicate name unless replacing, and removes', () => {
    const { storage, store } = setup();
    expect(store.list()).toEqual({ profiles: [], rejected: 0, available: true, readable: true });
    expect(store.save(profile())).toEqual({ ok: true });
    expect(store.list().profiles.map((saved) => saved.name)).toEqual(['Person A']);
    expect(store.save(profile({ name: 'person a' }))).toMatchObject({ ok: false, code: 'exists' });
    expect(store.save(profile({ scanIntervalMs: 3_000 }), true)).toEqual({ ok: true });
    expect(store.list().profiles).toHaveLength(1);
    expect(store.get('PERSON A')?.scanIntervalMs).toBe(3_000);
    expect(store.remove('Person A')).toEqual({ ok: true });
    expect(store.remove('Person A')).toMatchObject({ ok: false, code: 'missing' });
    expect(JSON.parse(storage.data.get(PROFILE_KEY)!)).toEqual({ version: 1, profiles: [] });
  });

  it('stores nothing but the profile fields', () => {
    const { storage, store } = setup();
    store.save(profile());
    expect([...storage.data.keys()]).toEqual([PROFILE_KEY]);
    const raw = storage.data.get(PROFILE_KEY)!;
    expect(raw).not.toMatch(/frame|video|message|statistics|evidence/i);
  });

  it('refuses to save an invalid profile', () => {
    const { store } = setup();
    expect(store.save({ ...profile(), scanIntervalMs: 99 })).toMatchObject({ ok: false, code: 'invalid' });
    expect(store.list().profiles).toEqual([]);
  });

  it('skips and counts unreadable entries but writes them back unchanged on save and remove', () => {
    const { storage, store } = setup();
    const broken = { ...profile({ name: 'Broken' }), version: 9 };
    storage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, profiles: [broken, profile({ name: 'Kept' })] }));
    expect(store.list()).toMatchObject({ rejected: 1, readable: true, profiles: [expect.objectContaining({ name: 'Kept' })] });
    expect(store.save(profile({ name: 'New' }))).toEqual({ ok: true });
    expect(store.remove('Kept')).toEqual({ ok: true });
    const entries = JSON.parse(storage.data.get(PROFILE_KEY)!).profiles;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual(broken);
    expect(entries[1].name).toBe('New');
  });

  it('counts unreadable entries toward the limit and points to Delete all', () => {
    const { storage, store } = setup();
    const entries = Array.from({ length: MAX_PROFILES }, (_, index) => index === 0 ? { junk: true } : profile({ name: `P${index}` }));
    storage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, profiles: entries }));
    const result = store.save(profile({ name: 'One more' }));
    expect(result).toMatchObject({ ok: false, code: 'limit' });
    expect(!result.ok && result.reason).toMatch(/Delete all/);
    expect(store.save(profile({ name: 'P3' }), true)).toEqual({ ok: true });
  });

  it.each([['corrupt JSON', '{not json'], ['another container version', JSON.stringify({ version: 2, profiles: [] })]])(
    'refuses single saves and deletes on %s until Delete all clears it', (_name, raw) => {
      const { storage, store } = setup();
      storage.setItem(PROFILE_KEY, raw);
      expect(store.list()).toEqual({ profiles: [], rejected: 0, available: true, readable: false });
      expect(store.save(profile())).toMatchObject({ ok: false, code: 'unreadable' });
      expect(store.remove('Person A')).toMatchObject({ ok: false, code: 'unreadable' });
      expect(storage.data.get(PROFILE_KEY)).toBe(raw);
      expect(store.removeAll()).toEqual({ ok: true });
      expect(storage.data.has(PROFILE_KEY)).toBe(false);
      expect(store.save(profile())).toEqual({ ok: true });
    });

  it('never throws when storage is blocked or full', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('blocked'); } };
    const blocked = createLocalProfileStore(() => throwing);
    expect(blocked.list()).toEqual({ profiles: [], rejected: 0, available: false, readable: true });
    expect(blocked.save(profile())).toMatchObject({ ok: false, code: 'unavailable' });
    expect(blocked.removeAll()).toMatchObject({ ok: false, code: 'unavailable' });
    const missing = createLocalProfileStore(() => { throw new Error('SecurityError'); });
    expect(missing.list().available).toBe(false);
    const full = createMemoryStorage();
    full.setItem = () => { throw new Error('quota'); };
    expect(createLocalProfileStore(() => full).save(profile())).toMatchObject({ ok: false, code: 'unavailable' });
  });
});
