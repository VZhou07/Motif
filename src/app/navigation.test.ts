import { describe, expect, it } from 'vitest';
import { buildLevel, CONTROL_LABELS, effectiveLevel, type Level, type LevelContext } from './navigation';
import { addFavourite, addGroup, defaultVocabulary, type Vocabulary } from './vocabulary';

const gesture = (movements: number, timed = true): LevelContext =>
  ({ stage: 'communication', inputMode: 'gesture', timed, movements, hasApproved: true, decisions: [] });
const assisted = (hasApproved: boolean): LevelContext =>
  ({ stage: 'communication', inputMode: 'assisted', timed: true, movements: hasApproved ? 1 : 0, hasApproved, decisions: [] });
const practice = (decisions: LevelContext['decisions'] = []): LevelContext => ({ ...gesture(1), stage: 'practice', decisions });
const ids = (level: Level, context: LevelContext, vocabulary: Vocabulary = defaultVocabulary()) =>
  buildLevel(level, vocabulary, context).map((target) => target.id);

describe('top level', () => {
  it('is Speak, Undo, one tile per group with Favourites first, Pause and More', () => {
    expect(ids('top', gesture(1))).toEqual(['speak', 'undo', 'group:favourites', 'group:g1', 'group:g2', 'pause', 'more']);
    expect(ids('top', assisted(false))).toEqual(ids('top', gesture(4, false)));
  });

  it('names group tiles with their phrase count and keeps an empty group in place', () => {
    const targets = buildLevel('top', defaultVocabulary(), gesture(1));
    expect(targets.find((target) => target.id === 'group:g2')).toEqual({ id: 'group:g2', label: 'Open Needs, 3 phrases', kind: 'group' });
    expect(targets.find((target) => target.id === 'group:favourites')?.label).toBe('Favourites (empty)');
    expect(targets.find((target) => target.id === 'more')?.kind).toBe('nav');
    const one = addFavourite(defaultVocabulary(), 'Hello');
    if (!one.ok) throw new Error('fixture');
    expect(buildLevel('top', one.value, gesture(1))[2]!.label).toBe('Open Favourites, 1 phrase');
  });

  it('has 7 targets with the default groups, against 15–16 in the old flat list', () => {
    expect(ids('top', gesture(1))).toHaveLength(7);
  });

  it('only adds a tile when a group is added; existing positions do not move', () => {
    const more = addGroup(defaultVocabulary(), 'Family');
    if (!more.ok) throw new Error('fixture');
    const before = ids('top', gesture(1));
    const after = ids('top', gesture(1), more.value);
    expect(after.slice(0, 5)).toEqual(before.slice(0, 5));
    expect(after[5]).toBe('group:g3');
  });
});

describe('inside a group', () => {
  it('lists the group phrases, then Back and Pause', () => {
    const targets = buildLevel({ group: 'g2' }, defaultVocabulary(), gesture(1));
    expect(targets.map((target) => [target.id, target.label, target.kind])).toEqual([
      ['phrase:g2:0', 'I need water', 'phrase'], ['phrase:g2:1', 'Please help me', 'phrase'], ['phrase:g2:2', 'I am uncomfortable', 'phrase'],
      ['back', 'Back', 'nav'], ['pause', 'Pause', 'control']]);
  });

  it('is the same for practice and every input mode', () => {
    for (const context of [gesture(1), gesture(3, false), assisted(true), practice()]) {
      expect(ids({ group: 'g1' }, context)).toEqual(['phrase:g1:0', 'phrase:g1:1', 'phrase:g1:2', 'back', 'pause']);
    }
  });

  it('falls back to the top level for a missing or empty group', () => {
    expect(ids({ group: 'g9' }, gesture(1))).toEqual(ids('top', gesture(1)));
    expect(ids({ group: 'favourites' }, gesture(1))).toEqual(ids('top', gesture(1)));
    expect(effectiveLevel({ group: 'favourites' }, defaultVocabulary(), 'communication')).toBe('top');
    expect(effectiveLevel({ group: 'g1' }, defaultVocabulary(), 'communication')).toEqual({ group: 'g1' });
  });
});

describe('More', () => {
  it.each([
    [1, true, ['clear', 'save-favourite', 'say-again', 'slower', 'faster', 'practice', 'change-controls', 'add-movement', 'recalibrate', 'back', 'pause']],
    [2, false, ['clear', 'save-favourite', 'say-again', 'practice', 'change-controls', 'tiring', 'add-movement', 'recalibrate', 'back', 'pause']],
    [4, false, ['clear', 'save-favourite', 'say-again', 'practice', 'change-controls', 'tiring', 'recalibrate', 'back', 'pause']],
  ])('with %i movement(s) (timed: %s) holds the rarer controls and ends with Back and Pause', (movements, timed, expected) => {
    expect(ids('more', gesture(movements, timed))).toEqual(expected);
  });

  it('keeps step mode that fell back to automatic able to change speed', () => {
    expect(ids('more', gesture(2, true))).toContain('slower');
  });

  it('in assisted mode keeps its own movement setup choice', () => {
    expect(ids('more', assisted(false))).toEqual(['clear', 'save-favourite', 'say-again', 'slower', 'faster', 'practice', 'setup-gesture', 'back', 'pause']);
    expect(ids('more', assisted(true))).toContain('use-gesture');
    expect(ids('more', assisted(true))).not.toContain('recalibrate');
  });
});

describe('confirm a favourite', () => {
  it('offers Save, Cancel and Pause, naming the exact text', () => {
    const targets = buildLevel({ confirm: 'Yes. Thank you' }, defaultVocabulary(), gesture(1));
    expect(targets.map((target) => target.id)).toEqual(['confirm-favourite', 'cancel-favourite', 'pause']);
    expect(targets[0]!.label).toBe('Save “Yes. Thank you” to Favourites');
  });
});

describe('practice', () => {
  it('replaces Speak and Undo with Finish practice, has no More, and keeps Use previous at the top', () => {
    const previous = [{ id: 'use-previous', label: 'Use previous controls', kind: 'decision' as const }];
    expect(ids('top', practice(previous))).toEqual(['finish-practice', 'group:favourites', 'group:g1', 'group:g2', 'pause', 'use-previous']);
    expect(ids('top', practice())).not.toContain('more');
  });

  it('never offers More or the confirm level', () => {
    expect(ids('more', practice())).toEqual(ids('top', practice()));
    expect(ids({ confirm: 'x' }, practice())).toEqual(ids('top', practice()));
    expect(effectiveLevel('more', defaultVocabulary(), 'practice')).toBe('top');
  });
});

describe('every level', () => {
  const levels: Level[] = ['top', 'more', { group: 'g1' }, { confirm: 'Hi' }];
  const contexts = [gesture(1), gesture(2, false), gesture(4, false), assisted(false), assisted(true), practice()];

  it('includes Pause, has unique ids and has a label for every target', () => {
    for (const level of levels) for (const context of contexts) {
      const targets = buildLevel(level, defaultVocabulary(), context);
      expect(targets.some((target) => target.id === 'pause')).toBe(true);
      expect(new Set(targets.map((target) => target.id)).size).toBe(targets.length);
      expect(targets.every((target) => target.label.trim().length > 0)).toBe(true);
    }
  });

  it('can reach Recalibrate from the top with gesture input: More, then inside it', () => {
    expect(ids('top', gesture(1))).toContain('more');
    expect(ids('more', gesture(1))).toContain('recalibrate');
    expect(CONTROL_LABELS.recalibrate).toBe('Recalibrate');
  });
});
