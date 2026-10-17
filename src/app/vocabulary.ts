import type { Result } from '../domain/types';

/** A named list of phrases. `id` is 'favourites' or 'g1', 'g2', …; stable within a vocabulary (R14). */
export interface PhraseGroup { id: string; name: string; phrases: string[] }
/** groups[0] is always Favourites. Deliberately saved settings, never message history. */
export interface Vocabulary { groups: PhraseGroup[] }

export const FAVOURITES_ID = 'favourites';
export const VOCABULARY_LIMITS = { groups: 6, phrases: 12, nameMax: 24, phraseMax: 120 } as const;
const GROUP_ID = /^g[1-9][0-9]*$/;

export function defaultVocabulary(): Vocabulary {
  return {
    groups: [
      { id: FAVOURITES_ID, name: 'Favourites', phrases: [] },
      { id: 'g1', name: 'Quick', phrases: ['Yes', 'No', 'Thank you'] },
      { id: 'g2', name: 'Needs', phrases: ['I need water', 'Please help me', 'I am uncomfortable'] },
    ],
  };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const copy = (vocabulary: Vocabulary): Vocabulary =>
  ({ groups: vocabulary.groups.map((group) => ({ ...group, phrases: [...group.phrases] })) });
const fail = (reason: string): Result<Vocabulary> => ({ ok: false, reasons: [reason] });

function phraseProblem(text: string): string | null {
  const phrase = text.trim();
  if (!phrase) return 'A phrase cannot be empty.';
  if (phrase.length > VOCABULARY_LIMITS.phraseMax) return `A phrase can be at most ${VOCABULARY_LIMITS.phraseMax} characters.`;
  return null;
}

function nameProblem(text: string): string | null {
  const name = text.trim();
  if (!name) return 'A group name cannot be empty.';
  if (name.length > VOCABULARY_LIMITS.nameMax) return `A group name can be at most ${VOCABULARY_LIMITS.nameMax} characters.`;
  return null;
}

function editable(vocabulary: Vocabulary, groupId: string): Result<{ next: Vocabulary; group: PhraseGroup }> {
  const next = copy(vocabulary);
  const group = next.groups.find((entry) => entry.id === groupId);
  return group ? { ok: true, value: { next, group } } : { ok: false, reasons: ['That group no longer exists.'] };
}

/** Why `text` cannot be added to the group, or null when it can. Lets the UI check before asking for confirmation. */
export function addProblem(vocabulary: Vocabulary, groupId: string, text: string): string | null {
  const group = vocabulary.groups.find((entry) => entry.id === groupId);
  if (!group) return 'That group no longer exists.';
  const problem = phraseProblem(text);
  if (problem) return problem;
  if (group.phrases.some((phrase) => same(phrase, text))) return `“${text.trim()}” is already in ${group.name}.`;
  if (group.phrases.length >= VOCABULARY_LIMITS.phrases) return `${group.name} is full (${VOCABULARY_LIMITS.phrases} phrases). Remove one first.`;
  return null;
}

export function addPhrase(vocabulary: Vocabulary, groupId: string, text: string): Result<Vocabulary> {
  const problem = addProblem(vocabulary, groupId, text);
  if (problem) return fail(problem);
  const found = editable(vocabulary, groupId);
  if (!found.ok) return found;
  found.value.group.phrases.push(text.trim());
  return { ok: true, value: found.value.next };
}

export function addFavourite(vocabulary: Vocabulary, text: string): Result<Vocabulary> {
  return addPhrase(vocabulary, FAVOURITES_ID, text);
}

export function removePhrase(vocabulary: Vocabulary, groupId: string, index: number): Result<Vocabulary> {
  const found = editable(vocabulary, groupId);
  if (!found.ok) return found;
  const { next, group } = found.value;
  if (!Number.isInteger(index) || index < 0 || index >= group.phrases.length) return fail('That phrase no longer exists.');
  group.phrases.splice(index, 1);
  return { ok: true, value: next };
}

export function editPhrase(vocabulary: Vocabulary, groupId: string, index: number, text: string): Result<Vocabulary> {
  const found = editable(vocabulary, groupId);
  if (!found.ok) return found;
  const { next, group } = found.value;
  if (!Number.isInteger(index) || index < 0 || index >= group.phrases.length) return fail('That phrase no longer exists.');
  const problem = phraseProblem(text);
  if (problem) return fail(problem);
  if (group.phrases.some((phrase, at) => at !== index && same(phrase, text))) return fail(`“${text.trim()}” is already in ${group.name}.`);
  group.phrases[index] = text.trim();
  return { ok: true, value: next };
}

/** Moves a phrase to another position within its own group. */
export function movePhrase(vocabulary: Vocabulary, groupId: string, from: number, to: number): Result<Vocabulary> {
  const found = editable(vocabulary, groupId);
  if (!found.ok) return found;
  const { next, group } = found.value;
  const count = group.phrases.length;
  if (![from, to].every((at) => Number.isInteger(at) && at >= 0 && at < count)) return fail('That phrase cannot move there.');
  const [phrase] = group.phrases.splice(from, 1);
  group.phrases.splice(to, 0, phrase!);
  return { ok: true, value: next };
}

/** New ids are one more than the highest existing number, so ids already in the list are never repeated. */
function nextGroupId(vocabulary: Vocabulary): string {
  const numbers = vocabulary.groups.filter((group) => GROUP_ID.test(group.id)).map((group) => Number(group.id.slice(1)));
  return `g${Math.max(0, ...numbers) + 1}`;
}

export function addGroup(vocabulary: Vocabulary, name: string): Result<Vocabulary> {
  const problem = nameProblem(name);
  if (problem) return fail(problem);
  if (vocabulary.groups.length >= VOCABULARY_LIMITS.groups) return fail(`There can be at most ${VOCABULARY_LIMITS.groups} groups, including Favourites.`);
  if (vocabulary.groups.some((group) => same(group.name, name))) return fail(`There is already a group called ${name.trim()}.`);
  const next = copy(vocabulary);
  next.groups.push({ id: nextGroupId(vocabulary), name: name.trim(), phrases: [] });
  return { ok: true, value: next };
}

export function renameGroup(vocabulary: Vocabulary, groupId: string, name: string): Result<Vocabulary> {
  if (groupId === FAVOURITES_ID) return fail('Favourites cannot be renamed.');
  const found = editable(vocabulary, groupId);
  if (!found.ok) return found;
  const problem = nameProblem(name);
  if (problem) return fail(problem);
  if (vocabulary.groups.some((group) => group.id !== groupId && same(group.name, name))) return fail(`There is already a group called ${name.trim()}.`);
  found.value.group.name = name.trim();
  return { ok: true, value: found.value.next };
}

/** A group that still holds phrases is removed only with `force`, so phrases are never lost by accident. */
export function removeGroup(vocabulary: Vocabulary, groupId: string, force = false): Result<Vocabulary> {
  if (groupId === FAVOURITES_ID) return fail('Favourites cannot be removed.');
  const group = vocabulary.groups.find((entry) => entry.id === groupId);
  if (!group) return fail('That group no longer exists.');
  if (group.phrases.length && !force) return fail(`${group.name} still has ${group.phrases.length} phrase${group.phrases.length === 1 ? '' : 's'}. Confirm to remove them too.`);
  const next = copy(vocabulary);
  next.groups = next.groups.filter((entry) => entry.id !== groupId);
  return { ok: true, value: next };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

/** Validates untrusted data (a stored profile) against every limit; returns a fresh, trimmed copy. */
export function parseVocabulary(value: unknown): Result<Vocabulary> {
  const bad = (reason: string): Result<Vocabulary> => ({ ok: false, reasons: [`The saved phrases are not readable: ${reason}`] });
  if (!isRecord(value) || !exactKeys(value, ['groups']) || !Array.isArray(value.groups)) return bad('no phrase groups.');
  const groups = value.groups;
  if (groups.length < 1 || groups.length > VOCABULARY_LIMITS.groups) return bad(`there must be 1–${VOCABULARY_LIMITS.groups} groups.`);
  const result: PhraseGroup[] = [];
  for (const [at, group] of groups.entries()) {
    if (!isRecord(group) || !exactKeys(group, ['id', 'name', 'phrases'])) return bad('a group has the wrong fields.');
    const { id, name, phrases } = group;
    if (typeof id !== 'string' || typeof name !== 'string' || !Array.isArray(phrases)) return bad('a group has the wrong fields.');
    if (at === 0 ? id !== FAVOURITES_ID || name !== 'Favourites' : !GROUP_ID.test(id)) return bad('Favourites must come first and other group ids must look like g1.');
    if (result.some((entry) => entry.id === id)) return bad('two groups share an id.');
    if (nameProblem(name) || result.some((entry) => same(entry.name, name))) return bad('a group name is empty, too long or repeated.');
    if (phrases.length > VOCABULARY_LIMITS.phrases) return bad(`a group has more than ${VOCABULARY_LIMITS.phrases} phrases.`);
    const kept: string[] = [];
    for (const phrase of phrases) {
      if (typeof phrase !== 'string' || phraseProblem(phrase) || kept.some((entry) => same(entry, phrase))) return bad('a phrase is empty, too long or repeated.');
      kept.push(phrase.trim());
    }
    result.push({ id, name: name.trim(), phrases: kept });
  }
  return { ok: true, value: { groups: result } };
}

export const phraseCount = (vocabulary: Vocabulary) => vocabulary.groups.reduce((sum, group) => sum + group.phrases.length, 0);

/** One helper edit, so the UI and session pass a typed change instead of a free function. */
export type VocabularyEdit =
  | { kind: 'add-phrase'; group: string; text: string }
  | { kind: 'edit-phrase'; group: string; index: number; text: string }
  | { kind: 'remove-phrase'; group: string; index: number }
  | { kind: 'move-phrase'; group: string; from: number; to: number }
  | { kind: 'add-group'; name: string }
  | { kind: 'rename-group'; group: string; name: string }
  | { kind: 'remove-group'; group: string; force?: boolean };

export function applyEdit(vocabulary: Vocabulary, edit: VocabularyEdit): Result<Vocabulary> {
  switch (edit.kind) {
    case 'add-phrase': return addPhrase(vocabulary, edit.group, edit.text);
    case 'edit-phrase': return editPhrase(vocabulary, edit.group, edit.index, edit.text);
    case 'remove-phrase': return removePhrase(vocabulary, edit.group, edit.index);
    case 'move-phrase': return movePhrase(vocabulary, edit.group, edit.from, edit.to);
    case 'add-group': return addGroup(vocabulary, edit.name);
    case 'rename-group': return renameGroup(vocabulary, edit.group, edit.name);
    case 'remove-group': return removeGroup(vocabulary, edit.group, edit.force);
  }
}
