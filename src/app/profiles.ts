import { FEATURE_IDS, type Baseline, type GestureModel, type Result } from '../domain/types';
import { isGestureModel } from '../engine/recognition';
import { validateMapping, type Assignments, type Mapping } from './mapping';
import { STARTER_PHRASES } from './types';

/**
 * Local profiles (R7). Only approved movement thresholds, controls, phrases, scan speed, the
 * automatic setup's resting summary numbers and the times its checks last passed (R17) are
 * stored; never video, frames, evidence or messages.
 */
export const PROFILE_VERSION = 1;
export const PROFILE_KEY = 'motif.profiles';
export const MAX_PROFILES = 8;
/** Reserved name the session refreshes automatically after approval, so a page refresh never loses the setup. */
export const AUTO_PROFILE_NAME = 'Last setup';
export const FEATURE_SCHEMA = FEATURE_IDS.join(',');
/** Mirrors SESSION_LIMITS scan bounds (checked by a test) without importing the session. */
export const PROFILE_SCAN = { minMs: 1_000, maxMs: 6_000, stepMs: 500 } as const;
export const NAME_MAX = 40;
const LABEL_MAX = 60;
const PHRASE_MAX = 60;

export interface StoredProfile {
  version: typeof PROFILE_VERSION;
  featureSchema: string;
  name: string;
  models: GestureModel[];
  mapping: { assignments: Assignments };
  phrases: string[];
  scanIntervalMs: number;
  /** Summary numbers of the resting face (never frames), so Continue can skip the rest check. Absent in older profiles. */
  baseline?: Baseline;
  /** R17: wall-clock times (ms) the rest check and each movement's checks last really passed. Absent in older profiles. */
  checks?: StoredChecks;
}

export interface StoredChecks { restAt?: number; movementAt: Record<string, number> }

/** Same model, same key: the saved fields in a fixed order (R15/R17 recent-check times). */
export function modelKey(model: GestureModel): string {
  return JSON.stringify(MODEL_KEYS.map((key) => model[key as keyof GestureModel]));
}

const PROFILE_KEYS = ['version', 'featureSchema', 'name', 'models', 'mapping', 'phrases', 'scanIntervalMs'];
export const MODEL_KEYS = ['id', 'label', 'feature', 'direction', 'baselineCenter', 'activationThreshold', 'releaseThreshold', 'activationMs', 'releaseMs'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Exactly these keys: nothing extra is ever kept, nothing required is missing. */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const STATISTIC_KEYS = ['center', 'noise', 'low', 'high'];

function isBaseline(value: unknown): value is Baseline {
  if (!isRecord(value) || !hasExactKeys(value, ['durationMs', 'samples', 'statistics'])) return false;
  if (!Number.isFinite(value.durationMs) || !Number.isFinite(value.samples)) return false;
  const statistics = value.statistics;
  if (!isRecord(statistics) || !hasExactKeys(statistics, FEATURE_IDS)) return false;
  return FEATURE_IDS.every((feature) => {
    const entry = statistics[feature];
    return isRecord(entry) && hasExactKeys(entry, STATISTIC_KEYS) && STATISTIC_KEYS.every((key) => Number.isFinite(entry[key]))
      && (entry.noise as number) > 0;
  });
}

function isChecks(value: unknown, ids: ReadonlySet<string>): value is StoredChecks {
  if (!isRecord(value)) return false;
  const withRest = Object.hasOwn(value, 'restAt');
  if (!hasExactKeys(value, withRest ? ['restAt', 'movementAt'] : ['movementAt'])) return false;
  const time = (at: unknown) => typeof at === 'number' && Number.isFinite(at) && at > 0;
  if (withRest && !time(value.restAt)) return false;
  const movementAt = value.movementAt;
  return isRecord(movementAt) && Object.entries(movementAt).every(([id, at]) => ids.has(id) && time(at));
}

/** Strict validation of anything read from storage (R7 revision 2, B3). */
export function parseProfile(value: unknown): Result<StoredProfile> {
  if (!isRecord(value)) return { ok: false, reasons: ['A saved profile is not readable.'] };
  if (value.version !== PROFILE_VERSION) return { ok: false, reasons: ['This profile was made by a different version of Motif.'] };
  const withBaseline = Object.hasOwn(value, 'baseline');
  const withChecks = Object.hasOwn(value, 'checks');
  if (!hasExactKeys(value, [...PROFILE_KEYS, ...(withBaseline ? ['baseline'] : []), ...(withChecks ? ['checks'] : [])])) return { ok: false, reasons: ['This profile has missing or unexpected data.'] };
  if (value.featureSchema !== FEATURE_SCHEMA) return { ok: false, reasons: ['This profile uses a different set of face measurements.'] };
  const reasons: string[] = [];
  const name = value.name;
  if (typeof name !== 'string' || !name.trim() || name.trim() !== name || name.length > NAME_MAX) reasons.push(`A profile name must be 1–${NAME_MAX} characters.`);
  const models = value.models;
  if (!Array.isArray(models) || models.length < 1 || models.length > 4) {
    reasons.push('A profile must hold between one and four movements.');
  } else {
    if (!models.every((model) => isRecord(model) && hasExactKeys(model, MODEL_KEYS) && isGestureModel(model))) {
      reasons.push('A saved movement has invalid or missing numbers.');
    } else {
      const list = models as GestureModel[];
      if (list.some((model) => model.label.trim().length < 1 || model.label.length > LABEL_MAX)) reasons.push(`Movement names must be 1–${LABEL_MAX} characters.`);
      if (new Set(list.map((model) => model.id)).size !== list.length) reasons.push('Two saved movements share an id.');
      if (new Set(list.map((model) => `${model.feature}:${model.direction}`)).size !== list.length) reasons.push('The same movement is saved twice.');
    }
  }
  const mapping = value.mapping;
  if (!isRecord(mapping) || !hasExactKeys(mapping, ['assignments']) || !isRecord(mapping.assignments)) {
    reasons.push('The saved controls are not readable.');
  } else if (!reasons.length) {
    const valid = validateMapping(models as GestureModel[], mapping.assignments as Assignments);
    if (!valid.ok) reasons.push(...valid.reasons);
  }
  const phrases = value.phrases;
  if (!Array.isArray(phrases) || phrases.length !== STARTER_PHRASES.length
    || !phrases.every((phrase) => typeof phrase === 'string' && phrase.trim().length > 0 && phrase.length <= PHRASE_MAX)) {
    reasons.push(`A profile must hold exactly ${STARTER_PHRASES.length} phrases of 1–${PHRASE_MAX} characters.`);
  }
  if (withBaseline && !isBaseline(value.baseline)) reasons.push('The saved resting numbers are not readable.');
  const ids = new Set(Array.isArray(models) ? models.map((model) => (isRecord(model) ? model.id : undefined)).filter((id): id is string => typeof id === 'string') : []);
  if (withChecks && !isChecks(value.checks, ids)) reasons.push('The saved check times are not readable.');
  const interval = value.scanIntervalMs;
  if (typeof interval !== 'number' || !Number.isFinite(interval) || interval < PROFILE_SCAN.minMs || interval > PROFILE_SCAN.maxMs || interval % PROFILE_SCAN.stepMs !== 0) {
    reasons.push('The saved scan speed is out of range.');
  }
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, value: value as unknown as StoredProfile };
}

export interface ProfileFields { name: string; models: readonly GestureModel[]; mapping: Mapping; phrases: readonly string[]; scanIntervalMs: number; baseline?: Baseline | null; checks?: StoredChecks | null }

/** Explicit fields only, so nothing extra attached to a live baseline is ever stored. */
function copyBaseline(baseline: Baseline): Baseline {
  return {
    durationMs: baseline.durationMs, samples: baseline.samples,
    statistics: Object.fromEntries(FEATURE_IDS.map((feature) => {
      const { center, noise, low, high } = baseline.statistics[feature];
      return [feature, { center, noise, low, high }];
    })) as Baseline['statistics'],
  };
}

/** Builds a profile from explicit fields only, then validates it exactly as a stored one. */
export function buildProfile(fields: ProfileFields): Result<StoredProfile> {
  return parseProfile({
    version: PROFILE_VERSION,
    featureSchema: FEATURE_SCHEMA,
    name: fields.name.trim(),
    models: fields.models.map((model) => Object.fromEntries(MODEL_KEYS.map((key) => [key, model[key as keyof GestureModel]]))),
    mapping: { assignments: { ...fields.mapping.assignments } },
    phrases: [...fields.phrases],
    scanIntervalMs: fields.scanIntervalMs,
    ...(fields.baseline ? { baseline: copyBaseline(fields.baseline) } : {}),
    ...(fields.checks ? { checks: { ...(fields.checks.restAt !== undefined ? { restAt: fields.checks.restAt } : {}), movementAt: { ...fields.checks.movementAt } } } : {}),
  });
}

// ── Storage ────────────────────────────────────────────────────────────────

export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export interface ProfileList {
  profiles: StoredProfile[];
  /** Stored entries that could not be read; they are kept untouched until Delete all. */
  rejected: number;
  /** False when browser storage is blocked or throws. */
  available: boolean;
  /** False when the stored container itself is corrupt or from another version. */
  readable: boolean;
}

export type StoreFailure = 'unavailable' | 'unreadable' | 'exists' | 'limit' | 'invalid' | 'missing';
export type StoreResult = { ok: true } | { ok: false; code: StoreFailure; reason: string };

export interface ProfileStore {
  list(): ProfileList;
  get(name: string): StoredProfile | null;
  save(profile: StoredProfile, replace?: boolean): StoreResult;
  remove(name: string): StoreResult;
  removeAll(): StoreResult;
}

const UNAVAILABLE = 'Saving is not available in this browser (storage is blocked or full).';
const UNREADABLE = 'Saved profiles on this device could not be read. Use Delete all to clear them.';

type Container = { kind: 'ok'; entries: unknown[] } | { kind: 'unavailable' } | { kind: 'unreadable' };

/** Wraps browser storage; every access is guarded so blocked or full storage never throws. */
export function createLocalProfileStore(getStorage: () => StorageLike | null | undefined): ProfileStore {
  const storage = (): StorageLike | null => { try { return getStorage() ?? null; } catch { return null; } };

  const read = (): Container => {
    const store = storage();
    if (!store) return { kind: 'unavailable' };
    let raw: string | null;
    try { raw = store.getItem(PROFILE_KEY); } catch { return { kind: 'unavailable' }; }
    if (raw === null) return { kind: 'ok', entries: [] };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.version !== PROFILE_VERSION || !Array.isArray(parsed.profiles) || !hasExactKeys(parsed, ['version', 'profiles'])) return { kind: 'unreadable' };
      return { kind: 'ok', entries: parsed.profiles };
    } catch { return { kind: 'unreadable' }; }
  };

  const write = (entries: unknown[]): StoreResult => {
    const store = storage();
    if (!store) return { ok: false, code: 'unavailable', reason: UNAVAILABLE };
    try { store.setItem(PROFILE_KEY, JSON.stringify({ version: PROFILE_VERSION, profiles: entries })); return { ok: true }; } catch {
      return { ok: false, code: 'unavailable', reason: UNAVAILABLE };
    }
  };

  const fail = (container: Container): StoreResult => container.kind === 'unavailable'
    ? { ok: false, code: 'unavailable', reason: UNAVAILABLE } : { ok: false, code: 'unreadable', reason: UNREADABLE };

  /** Index of the readable entry with this name; unreadable entries never match. */
  const indexOf = (entries: unknown[], name: string): number => entries.findIndex((entry) => {
    const parsed = parseProfile(entry);
    return parsed.ok && sameName(parsed.value.name, name);
  });

  const list = (): ProfileList => {
    const container = read();
    if (container.kind !== 'ok') return { profiles: [], rejected: 0, available: container.kind !== 'unavailable', readable: container.kind !== 'unreadable' };
    const profiles: StoredProfile[] = [];
    let rejected = 0;
    for (const entry of container.entries) {
      const parsed = parseProfile(entry);
      if (parsed.ok) profiles.push(parsed.value); else rejected += 1;
    }
    return { profiles, rejected, available: true, readable: true };
  };

  return {
    list,
    get: (name) => list().profiles.find((profile) => sameName(profile.name, name)) ?? null,
    save(profile, replace = false) {
      const valid = parseProfile(profile);
      if (!valid.ok) return { ok: false, code: 'invalid', reason: valid.reasons[0] ?? 'This profile is not valid.' };
      const container = read();
      if (container.kind !== 'ok') return fail(container);
      const entries = [...container.entries];
      const index = indexOf(entries, profile.name);
      if (index >= 0 && !replace) return { ok: false, code: 'exists', reason: `A profile named “${profile.name}” already exists.` };
      if (index >= 0) entries[index] = valid.value;
      else if (entries.length >= MAX_PROFILES) {
        const unreadable = entries.filter((entry) => !parseProfile(entry).ok).length;
        return { ok: false, code: 'limit', reason: `At most ${MAX_PROFILES} profiles can be saved. Delete one first${unreadable ? ', or use Delete all to clear unreadable ones' : ''}.` };
      } else entries.push(valid.value);
      return write(entries);
    },
    remove(name) {
      const container = read();
      if (container.kind !== 'ok') return fail(container);
      const index = indexOf(container.entries, name);
      if (index < 0) return { ok: false, code: 'missing', reason: `No saved profile is named “${name}”.` };
      return write(container.entries.filter((_, position) => position !== index));
    },
    removeAll() {
      const store = storage();
      if (!store) return { ok: false, code: 'unavailable', reason: UNAVAILABLE };
      try { store.removeItem(PROFILE_KEY); return { ok: true }; } catch { return { ok: false, code: 'unavailable', reason: UNAVAILABLE }; }
    },
  };
}

/** In-memory storage for tests and for sessions without browser storage: nothing outlives the page. */
export function createMemoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
}

export function createMemoryProfileStore(): ProfileStore {
  const storage = createMemoryStorage();
  return createLocalProfileStore(() => storage);
}
