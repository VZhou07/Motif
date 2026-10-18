import { MAX_GESTURES } from './mapping';
import type { InputMode, ScanTarget } from './types';
import { FAVOURITES_ID, type Vocabulary } from './vocabulary';

/**
 * Two-level communication scanning (R14). The top level is short; phrases sit inside groups and rarer
 * controls inside More. Pause is in every level, and lists never shift while they are scanned.
 */
export type Level = 'top' | 'more' | { group: string } | { confirm: string } | { clear: true } | { recalibrate: true };

export interface LevelContext {
  stage: 'communication' | 'practice';
  inputMode: InputMode;
  /** True when the highlight moves on a timer (automatic scanning or assisted Space). */
  timed: boolean;
  /** Approved movements (gesture input). */
  movements: number;
  hasApproved: boolean;
  /** Phrase groups and Favourites on (default true here; the app turns them off for now, R19). */
  groups?: boolean;
  /** Practice-only setup decisions shown at the top (`use-previous` when allowed). */
  decisions: readonly ScanTarget[];
}

export const CONTROL_LABELS: Record<string, string> = {
  speak: 'Speak', clear: 'Clear message', pause: 'Pause', slower: 'Slower scanning', faster: 'Faster scanning',
  practice: 'Practice', recalibrate: 'Recalibrate', 'finish-practice': 'Start talking',
  'setup-gesture': 'Set up a movement', 'use-gesture': 'Use my movement',
  'change-controls': 'Change controls', 'add-movement': 'Add a movement', tiring: 'A movement is tiring',
  undo: 'Undo', 'say-again': 'Say it again', 'save-favourite': 'Save message to Favourites',
  'cancel-favourite': 'Cancel, do not save', more: 'Helper', back: 'Back',
  'clear-no': 'Keep it', 'clear-yes': 'Yes, clear it', 'recalibrate-no': 'Keep current setup', 'recalibrate-yes': 'Start recalibration',
};

const control = (id: string): ScanTarget => ({ id, label: CONTROL_LABELS[id]!, kind: 'control' });
const nav = (id: 'more' | 'back'): ScanTarget => ({ id, label: CONTROL_LABELS[id]!, kind: 'nav' });
const plural = (count: number) => `${count} phrase${count === 1 ? '' : 's'}`;

export const isGroupLevel = (level: Level): level is { group: string } => typeof level === 'object' && 'group' in level;
/** Favourites confirmation only: drives every "Not saved" wording. */
export const isConfirmLevel = (level: Level): level is { confirm: string } => typeof level === 'object' && 'confirm' in level;
export const isClearLevel = (level: Level): level is { clear: true } => typeof level === 'object' && 'clear' in level;
export const isRecalibrateLevel = (level: Level): level is { recalibrate: true } => typeof level === 'object' && 'recalibrate' in level;

/** The groups' tiles: empty groups stay in place (and only announce) so learned timing never shifts. */
function groupTargets(vocabulary: Vocabulary): ScanTarget[] {
  return vocabulary.groups.map((group) => ({
    id: `group:${group.id}`,
    label: group.phrases.length ? `Open ${group.name}, ${plural(group.phrases.length)}` : `${group.name} (empty)`,
    kind: 'group' as const,
  }));
}

/** Flat mode (R19): every phrase except the hidden Favourites group, in order; ids are unchanged. */
function flatTargets(vocabulary: Vocabulary): ScanTarget[] {
  return vocabulary.groups.filter((group) => group.id !== FAVOURITES_ID).flatMap((group) =>
    group.phrases.map((label, index) => ({ id: `phrase:${group.id}:${index}`, label, kind: 'phrase' as const })));
}

const withGroups = (context: LevelContext) => context.groups !== false;

function moreControls(context: LevelContext): string[] {
  const speed = context.timed ? ['slower', 'faster'] : [];
  const save = withGroups(context) ? ['save-favourite'] : [];
  if (context.inputMode === 'assisted') {
    return ['clear', ...save, 'say-again', ...speed, 'practice', context.hasApproved ? 'use-gesture' : 'setup-gesture'];
  }
  return ['clear', ...save, 'say-again', ...speed, 'practice', 'change-controls',
    ...(context.movements < MAX_GESTURES ? ['add-movement'] : []), 'recalibrate'];
}

/**
 * Targets for one level. A group that no longer exists, or a level practice does not have, falls back to
 * the top level; the session then also treats the level as `top`.
 */
export function buildLevel(level: Level, vocabulary: Vocabulary, context: LevelContext): ScanTarget[] {
  const practice = context.stage === 'practice';
  const grouped = withGroups(context);
  if (isGroupLevel(level) && grouped) {
    const group = vocabulary.groups.find((entry) => entry.id === level.group);
    if (group && group.phrases.length) {
      return [
        ...group.phrases.map((label, index) => ({ id: `phrase:${group.id}:${index}`, label, kind: 'phrase' as const })),
        nav('back'), control('pause'),
      ];
    }
  } else if (level === 'more' && !practice) {
    return [...moreControls(context).map(control), { ...nav('back'), label: 'Close helper' }, control('pause')];
  } else if (isClearLevel(level) && !practice) {
    return ['clear-no', 'clear-yes', 'pause'].map(control);
  } else if (isRecalibrateLevel(level) && !practice) {
    return ['recalibrate-no', 'recalibrate-yes', 'pause'].map(control);
  } else if (isConfirmLevel(level) && !practice && grouped) {
    return [{ id: 'confirm-favourite', label: `Save “${level.confirm}” to Favourites`, kind: 'control' }, control('cancel-favourite'), control('pause')];
  }
  const tiles = grouped ? groupTargets(vocabulary) : flatTargets(vocabulary);
  if (practice) return [control('finish-practice'), ...tiles, control('pause'), ...context.decisions];
  return [control('speak'), control('undo'), ...tiles, control('pause'), nav('more')];
}

/** The level `buildLevel` actually produced, so the session never keeps a level that fell back to top. */
export function effectiveLevel(level: Level, vocabulary: Vocabulary, stage: LevelContext['stage'], groups = true): Level {
  if (!groups && (isGroupLevel(level) || isConfirmLevel(level))) return 'top';
  if (isGroupLevel(level)) return vocabulary.groups.some((group) => group.id === level.group && group.phrases.length) ? level : 'top';
  if (stage === 'practice' && level !== 'top') return 'top';
  return level;
}
