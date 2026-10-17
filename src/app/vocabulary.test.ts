import { describe, expect, it } from 'vitest';
import { STARTER_PHRASES } from './types';
import {
  addFavourite, addGroup, addPhrase, addProblem, applyEdit, defaultVocabulary, editPhrase, FAVOURITES_ID, movePhrase, parseVocabulary,
  phraseCount, removeGroup, removePhrase, renameGroup, VOCABULARY_LIMITS, type Vocabulary,
} from './vocabulary';

const value = <T>(result: { ok: true; value: T } | { ok: false; reasons: string[] }): T => {
  if (!result.ok) throw new Error(result.reasons.join(' '));
  return result.value;
};
const reasons = (result: { ok: boolean; reasons?: string[] }) => (result.ok ? [] : result.reasons!);
const frozen = (vocabulary: Vocabulary) => {
  for (const group of vocabulary.groups) Object.freeze(Object.freeze(group).phrases);
  return Object.freeze(Object.freeze(vocabulary).groups) && vocabulary;
};
const full = (count: number) => Array.from({ length: count }, (_, at) => `Phrase ${at + 1}`);

describe('default vocabulary', () => {
  it('starts with an empty Favourites and the same six starter phrases, grouped', () => {
    const vocabulary = defaultVocabulary();
    expect(vocabulary.groups.map((group) => [group.id, group.name])).toEqual([[FAVOURITES_ID, 'Favourites'], ['g1', 'Quick'], ['g2', 'Needs']]);
    expect(vocabulary.groups[0]!.phrases).toEqual([]);
    expect(vocabulary.groups.flatMap((group) => group.phrases).sort()).toEqual([...STARTER_PHRASES].sort());
    expect(value(parseVocabulary(vocabulary))).toEqual(vocabulary);
  });

  it('returns a fresh copy each time', () => {
    const first = defaultVocabulary();
    first.groups[1]!.phrases.push('Changed');
    expect(defaultVocabulary().groups[1]!.phrases).toEqual(['Yes', 'No', 'Thank you']);
  });
});

describe('phrase operations', () => {
  it('adds a trimmed phrase without changing the input', () => {
    const before = frozen(defaultVocabulary());
    const after = value(addPhrase(before, 'g1', '  Maybe  '));
    expect(after.groups[1]!.phrases).toEqual(['Yes', 'No', 'Thank you', 'Maybe']);
    expect(before.groups[1]!.phrases).toEqual(['Yes', 'No', 'Thank you']);
    expect(after.groups[2]).not.toBe(before.groups[2]);
  });

  it.each([
    ['empty', '   ', 'cannot be empty'],
    ['too long', 'x'.repeat(VOCABULARY_LIMITS.phraseMax + 1), 'at most 120'],
    ['a duplicate ignoring case and spaces', ' yes ', 'already in Quick'],
  ])('rejects a phrase that is %s', (_, text, reason) => {
    const result = addPhrase(defaultVocabulary(), 'g1', text);
    expect(result.ok).toBe(false);
    expect(reasons(result).join(' ')).toContain(reason);
  });

  it('accepts exactly the longest phrase and the same text in another group', () => {
    const longest = 'x'.repeat(VOCABULARY_LIMITS.phraseMax);
    expect(addPhrase(defaultVocabulary(), 'g1', longest).ok).toBe(true);
    expect(value(addPhrase(defaultVocabulary(), 'g2', 'Yes')).groups[2]!.phrases).toContain('Yes');
  });

  it('rejects a phrase when the group is full and never evicts one', () => {
    const vocabulary: Vocabulary = { groups: [{ id: FAVOURITES_ID, name: 'Favourites', phrases: full(VOCABULARY_LIMITS.phrases) }] };
    const result = addFavourite(vocabulary, 'One more');
    expect(reasons(result).join(' ')).toContain('Favourites is full (12 phrases)');
    expect(vocabulary.groups[0]!.phrases).toEqual(full(12));
    expect(addProblem(vocabulary, FAVOURITES_ID, 'One more')).toContain('is full');
  });

  it('reports the same problem before confirming as the add itself', () => {
    const vocabulary = value(addFavourite(defaultVocabulary(), 'Call my sister'));
    expect(addProblem(vocabulary, FAVOURITES_ID, 'call my sister')).toBe(reasons(addFavourite(vocabulary, 'call my sister'))[0]);
    expect(addProblem(vocabulary, FAVOURITES_ID, 'Turn on the light')).toBeNull();
    expect(addProblem(vocabulary, 'g9', 'Anything')).toBe('That group no longer exists.');
  });

  it('adds favourites to the Favourites group only', () => {
    const after = value(addFavourite(defaultVocabulary(), 'Yes'));
    expect(after.groups[0]!.phrases).toEqual(['Yes']);
    expect(phraseCount(after)).toBe(7);
  });

  it('removes, edits and moves phrases by index without changing the input', () => {
    const before = frozen(defaultVocabulary());
    expect(value(removePhrase(before, 'g2', 1)).groups[2]!.phrases).toEqual(['I need water', 'I am uncomfortable']);
    expect(value(editPhrase(before, 'g2', 0, ' I need a drink ')).groups[2]!.phrases[0]).toBe('I need a drink');
    expect(value(movePhrase(before, 'g1', 2, 0)).groups[1]!.phrases).toEqual(['Thank you', 'Yes', 'No']);
    expect(value(movePhrase(before, 'g1', 0, 2)).groups[1]!.phrases).toEqual(['No', 'Thank you', 'Yes']);
    expect(before.groups[2]!.phrases).toEqual(['I need water', 'Please help me', 'I am uncomfortable']);
  });

  it('allows an edit that only changes case, but not one that copies another phrase', () => {
    expect(value(editPhrase(defaultVocabulary(), 'g1', 0, 'YES')).groups[1]!.phrases[0]).toBe('YES');
    expect(reasons(editPhrase(defaultVocabulary(), 'g1', 0, 'no')).join(' ')).toContain('already in Quick');
    expect(editPhrase(defaultVocabulary(), 'g1', 0, '').ok).toBe(false);
  });

  it.each([-1, 3, 1.5, Number.NaN])('rejects the out-of-range index %s', (index) => {
    expect(removePhrase(defaultVocabulary(), 'g1', index).ok).toBe(false);
    expect(editPhrase(defaultVocabulary(), 'g1', index, 'Hi').ok).toBe(false);
    expect(movePhrase(defaultVocabulary(), 'g1', index, 0).ok).toBe(false);
    expect(movePhrase(defaultVocabulary(), 'g1', 0, index).ok).toBe(false);
  });

  it('rejects operations on a group that does not exist', () => {
    for (const result of [addPhrase(defaultVocabulary(), 'g7', 'Hi'), removePhrase(defaultVocabulary(), 'g7', 0),
      editPhrase(defaultVocabulary(), 'g7', 0, 'Hi'), movePhrase(defaultVocabulary(), 'g7', 0, 1)]) {
      expect(reasons(result)).toEqual(['That group no longer exists.']);
    }
  });

  it('lets a helper edit and remove favourites', () => {
    const saved = value(addFavourite(value(addFavourite(defaultVocabulary(), 'A')), 'B'));
    expect(value(editPhrase(saved, FAVOURITES_ID, 1, 'C')).groups[0]!.phrases).toEqual(['A', 'C']);
    expect(value(removePhrase(saved, FAVOURITES_ID, 0)).groups[0]!.phrases).toEqual(['B']);
  });
});

describe('group operations', () => {
  it('adds a group with the next id and no phrases', () => {
    const after = value(addGroup(frozen(defaultVocabulary()), ' Family '));
    expect(after.groups.at(-1)).toEqual({ id: 'g3', name: 'Family', phrases: [] });
  });

  it('uses one more than the highest id, so a removed middle id is not reused', () => {
    const removed = value(removeGroup(defaultVocabulary(), 'g1', true));
    expect(value(addGroup(removed, 'Family')).groups.map((group) => group.id)).toEqual([FAVOURITES_ID, 'g2', 'g3']);
    const gap: Vocabulary = { groups: [{ id: FAVOURITES_ID, name: 'Favourites', phrases: [] }, { id: 'g9', name: 'Nine', phrases: [] }] };
    expect(value(addGroup(gap, 'Ten')).groups[2]!.id).toBe('g10');
    const onlyFavourites: Vocabulary = { groups: [{ id: FAVOURITES_ID, name: 'Favourites', phrases: [] }] };
    expect(value(addGroup(onlyFavourites, 'First')).groups[1]!.id).toBe('g1');
  });

  it('allows at most six groups including Favourites', () => {
    let vocabulary = defaultVocabulary();
    for (const name of ['A', 'B', 'C']) vocabulary = value(addGroup(vocabulary, name));
    expect(vocabulary.groups).toHaveLength(VOCABULARY_LIMITS.groups);
    expect(reasons(addGroup(vocabulary, 'D')).join(' ')).toContain('at most 6 groups');
  });

  it.each([
    ['empty', '  ', 'cannot be empty'],
    ['too long', 'n'.repeat(VOCABULARY_LIMITS.nameMax + 1), 'at most 24'],
    ['already used', 'needs', 'already a group called needs'],
    ['the Favourites name', 'favourites', 'already a group'],
  ])('rejects a group name that is %s', (_, name, reason) => {
    expect(reasons(addGroup(defaultVocabulary(), name)).join(' ')).toContain(reason);
  });

  it('renames a group but never Favourites', () => {
    expect(value(renameGroup(defaultVocabulary(), 'g1', 'Answers')).groups[1]!.name).toBe('Answers');
    expect(value(renameGroup(defaultVocabulary(), 'g1', 'QUICK')).groups[1]!.name).toBe('QUICK');
    expect(reasons(renameGroup(defaultVocabulary(), FAVOURITES_ID, 'Saved'))).toEqual(['Favourites cannot be renamed.']);
    expect(renameGroup(defaultVocabulary(), 'g1', 'Needs').ok).toBe(false);
    expect(renameGroup(defaultVocabulary(), 'g5', 'X').ok).toBe(false);
  });

  it('removes an empty group, but a non-empty one only with force, and never Favourites', () => {
    const withEmpty = value(addGroup(defaultVocabulary(), 'Spare'));
    expect(value(removeGroup(withEmpty, 'g3')).groups).toHaveLength(3);
    const refused = removeGroup(defaultVocabulary(), 'g2');
    expect(reasons(refused).join(' ')).toContain('Needs still has 3 phrases');
    expect(value(removeGroup(defaultVocabulary(), 'g2', true)).groups.map((group) => group.id)).toEqual([FAVOURITES_ID, 'g1']);
    expect(reasons(removeGroup(defaultVocabulary(), FAVOURITES_ID, true))).toEqual(['Favourites cannot be removed.']);
    expect(removeGroup(defaultVocabulary(), 'g8').ok).toBe(false);
  });
});

describe('parsing stored vocabulary', () => {
  const groups = (...rest: unknown[]) => ({ groups: [{ id: FAVOURITES_ID, name: 'Favourites', phrases: [] }, ...rest] });

  it('accepts a valid vocabulary and returns a trimmed copy', () => {
    const input = groups({ id: 'g4', name: ' Family ', phrases: [' Hi '] });
    const parsed = value(parseVocabulary(input));
    expect(parsed).toEqual(groups({ id: 'g4', name: 'Family', phrases: ['Hi'] }));
    expect(parsed.groups[1]).not.toBe(input.groups[1]);
  });

  it.each([
    ['not an object', 'phrases'],
    ['an extra top-level key', { groups: [], extra: 1 }],
    ['no groups', { groups: [] }],
    ['seven groups', groups(...['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].map((id) => ({ id, name: id, phrases: [] })))],
    ['Favourites not first', { groups: [{ id: 'g1', name: 'Quick', phrases: [] }] }],
    ['Favourites renamed', { groups: [{ id: FAVOURITES_ID, name: 'Saved', phrases: [] }] }],
    ['a second Favourites', groups({ id: FAVOURITES_ID, name: 'Other', phrases: [] })],
    ['an id with a colon', groups({ id: 'g1:x', name: 'A', phrases: [] })],
    ['an id starting with zero', groups({ id: 'g0', name: 'A', phrases: [] })],
    ['a repeated id', groups({ id: 'g1', name: 'A', phrases: [] }, { id: 'g1', name: 'B', phrases: [] })],
    ['a repeated name', groups({ id: 'g1', name: 'A', phrases: [] }, { id: 'g2', name: 'a', phrases: [] })],
    ['an extra group key', groups({ id: 'g1', name: 'A', phrases: [], colour: 'red' })],
    ['a missing group key', groups({ id: 'g1', phrases: [] })],
    ['a too-long name', groups({ id: 'g1', name: 'n'.repeat(25), phrases: [] })],
    ['thirteen phrases', groups({ id: 'g1', name: 'A', phrases: full(13) })],
    ['an empty phrase', groups({ id: 'g1', name: 'A', phrases: [' '] })],
    ['a non-string phrase', groups({ id: 'g1', name: 'A', phrases: [5] })],
    ['a too-long phrase', groups({ id: 'g1', name: 'A', phrases: ['x'.repeat(121)] })],
    ['a repeated phrase', groups({ id: 'g1', name: 'A', phrases: ['Yes', ' yes'] })],
  ])('rejects %s', (_, input) => {
    const result = parseVocabulary(input);
    expect(result.ok).toBe(false);
    expect(reasons(result)[0]).toMatch(/^The saved phrases are not readable/);
  });

  it('accepts the limits exactly', () => {
    const six = groups(...['g1', 'g2', 'g3', 'g4', 'g5'].map((id) => ({ id, name: 'n'.repeat(23) + id.slice(1), phrases: full(12) })));
    expect(parseVocabulary(six).ok).toBe(true);
  });
});

describe('typed edits', () => {
  it('routes every edit kind to its operation with the same result', () => {
    const v = defaultVocabulary();
    const pairs: Array<[ReturnType<typeof applyEdit>, ReturnType<typeof applyEdit>]> = [
      [applyEdit(v, { kind: 'add-phrase', group: 'g1', text: 'Maybe' }), addPhrase(v, 'g1', 'Maybe')],
      [applyEdit(v, { kind: 'edit-phrase', group: 'g1', index: 0, text: 'Yep' }), editPhrase(v, 'g1', 0, 'Yep')],
      [applyEdit(v, { kind: 'remove-phrase', group: 'g2', index: 2 }), removePhrase(v, 'g2', 2)],
      [applyEdit(v, { kind: 'move-phrase', group: 'g2', from: 0, to: 2 }), movePhrase(v, 'g2', 0, 2)],
      [applyEdit(v, { kind: 'add-group', name: 'Family' }), addGroup(v, 'Family')],
      [applyEdit(v, { kind: 'rename-group', group: 'g2', name: 'Care' }), renameGroup(v, 'g2', 'Care')],
      [applyEdit(v, { kind: 'remove-group', group: 'g2' }), removeGroup(v, 'g2')],
      [applyEdit(v, { kind: 'remove-group', group: 'g2', force: true }), removeGroup(v, 'g2', true)],
    ];
    for (const [routed, direct] of pairs) expect(routed).toEqual(direct);
    expect(pairs[6]![0].ok).toBe(false);
  });
});
