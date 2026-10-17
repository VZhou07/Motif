import { MAX_GESTURES } from './mapping';
import type { InputMode, ScanTarget } from './types';
import type { Vocabulary } from './vocabulary';

/**
 * Two-level communication scanning (R14). The top level is short; phrases sit inside groups and rarer
 * controls inside More. Pause is in every level, and lists never shift while they are scanned.
 */
export type Level = 'top' | 'more' | 'ask' | { group: string } | { confirm: string };

export interface LevelContext {
  stage: 'communication' | 'practice';
  inputMode: InputMode;
  /** True when the highlight moves on a timer (automatic scanning or assisted Space). */
  timed: boolean;
  /** Approved movements (gesture input). */
  movements: number;
  hasApproved: boolean;
  /** Practice-only setup decisions shown at the top (`use-previous` when allowed). */
  decisions: readonly ScanTarget[];
  /** Caregiver request targets from the paired device (W1); empty when unpaired or not configured. */
  requests: readonly ScanTarget[];
}

export const CONTROL_LABELS: Record<string, string> = {
  speak: 'Speak message', clear: 'Clear message', pause: 'Pause', slower: 'Slower scanning', faster: 'Faster scanning',
  practice: 'Practice', recalibrate: 'Recalibrate', 'finish-practice': 'Finish practice',
  'setup-gesture': 'Set up a movement', 'use-gesture': 'Use my movement',
  'change-controls': 'Change controls', 'add-movement': 'Add a movement', tiring: 'A movement is tiring',
  undo: 'Undo last', 'say-again': 'Say again', 'save-favourite': 'Save message to Favourites',
  'cancel-favourite': 'Cancel, do not save', more: 'More options', back: 'Back', ask: 'Ask caregiver',
};

const control = (id: string): ScanTarget => ({ id, label: CONTROL_LABELS[id]!, kind: 'control' });
const nav = (id: 'more' | 'back'): ScanTarget => ({ id, label: CONTROL_LABELS[id]!, kind: 'nav' });
const plural = (count: number) => `${count} phrase${count === 1 ? '' : 's'}`;

export const isGroupLevel = (level: Level): level is { group: string } => typeof level === 'object' && 'group' in level;
export const isConfirmLevel = (level: Level): level is { confirm: string } => typeof level === 'object' && 'confirm' in level;

/** The groups' tiles: empty groups stay in place (and only announce) so learned timing never shifts. */
function groupTargets(vocabulary: Vocabulary): ScanTarget[] {
  return vocabulary.groups.map((group) => ({
    id: `group:${group.id}`,
    label: group.phrases.length ? `Open ${group.name}, ${plural(group.phrases.length)}` : `${group.name} (empty)`,
    kind: 'group' as const,
  }));
}

function moreControls(context: LevelContext): string[] {
  const speed = context.timed ? ['slower', 'faster'] : [];
  if (context.inputMode === 'assisted') {
    return ['clear', 'save-favourite', 'say-again', ...speed, 'practice', context.hasApproved ? 'use-gesture' : 'setup-gesture'];
  }
  return ['clear', 'save-favourite', 'say-again', ...speed, 'practice', 'change-controls',
    ...(context.movements > 1 ? ['tiring'] : []), ...(context.movements < MAX_GESTURES ? ['add-movement'] : []), 'recalibrate'];
}

/**
 * Targets for one level. A group that no longer exists, or a level practice does not have, falls back to
 * the top level; the session then also treats the level as `top`.
 */
export function buildLevel(level: Level, vocabulary: Vocabulary, context: LevelContext): ScanTarget[] {
  const practice = context.stage === 'practice';
  if (isGroupLevel(level)) {
    const group = vocabulary.groups.find((entry) => entry.id === level.group);
    if (group && group.phrases.length) {
      return [
        ...group.phrases.map((label, index) => ({ id: `phrase:${group.id}:${index}`, label, kind: 'phrase' as const })),
        nav('back'), control('pause'),
      ];
    }
  } else if (level === 'more' && !practice) {
    return [...moreControls(context).map(control), nav('back'), control('pause')];
  } else if (level === 'ask' && !practice && context.requests.length) {
    return [...context.requests, nav('back'), control('pause')];
  } else if (isConfirmLevel(level) && !practice) {
    return [{ id: 'confirm-favourite', label: `Save “${level.confirm}” to Favourites`, kind: 'control' }, control('cancel-favourite'), control('pause')];
  }
  if (practice) return [control('finish-practice'), ...groupTargets(vocabulary), control('pause'), ...context.decisions];
  // Ask comes after Pause so Pause keeps its position whether or not the device is paired (W1).
  const ask: ScanTarget[] = context.requests.length ? [{ id: 'ask', label: CONTROL_LABELS.ask!, kind: 'group' }] : [];
  return [control('speak'), control('undo'), ...groupTargets(vocabulary), control('pause'), ...ask, nav('more')];
}

/** The level `buildLevel` actually produced, so the session never keeps a level that fell back to top. */
export function effectiveLevel(level: Level, vocabulary: Vocabulary, stage: LevelContext['stage'], hasRequests = false): Level {
  if (level === 'ask') return stage === 'communication' && hasRequests ? level : 'top';
  if (isGroupLevel(level)) return vocabulary.groups.some((group) => group.id === level.group && group.phrases.length) ? level : 'top';
  if (stage === 'practice' && level !== 'top') return 'top';
  return level;
}
