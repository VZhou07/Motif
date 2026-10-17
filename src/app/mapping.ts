import type { GestureModel, Result } from '../domain/types';

export type ControlAction = 'select' | 'next' | 'previous' | 'pause';
export type Assignments = Record<string, ControlAction>;
/** `auto`: timed scanning with one select gesture. `step`: highlight moves only on next/previous. */
export type ScanMode = 'auto' | 'step';

export interface Mapping { assignments: Assignments; mode: ScanMode }
export interface MappingProposal extends Mapping { id: string; label: string }

export const MAX_GESTURES = 4;
const ACTIONS: readonly ControlAction[] = ['select', 'next', 'previous', 'pause'];
/** Remaining gestures (creation order) take these actions after the selector (R6). */
const SECONDARY: readonly ControlAction[] = ['next', 'previous', 'pause'];
const VERB: Record<ControlAction, string> = { select: 'selects', next: 'moves next', previous: 'moves back', pause: 'pauses or resumes' };

export function validateMapping(models: readonly GestureModel[], assignments: Assignments): Result<Mapping> {
  const ids = new Set(models.map((model) => model.id));
  const entries = Object.entries(assignments);
  const actions = entries.map(([, action]) => action);
  const reasons: string[] = [];
  if (models.length > MAX_GESTURES) reasons.push(`At most ${MAX_GESTURES} movements can be used together.`);
  if (!entries.length) reasons.push('Assign at least one movement.');
  if (entries.some(([id]) => !ids.has(id))) reasons.push('A control refers to a movement that is not verified.');
  if (actions.some((action) => !ACTIONS.includes(action))) reasons.push('A control uses an unknown action.');
  if (actions.filter((action) => action === 'select').length !== 1) reasons.push('Exactly one movement must select.');
  if (new Set(actions).size !== actions.length) reasons.push('Each action can belong to only one movement.');
  if (actions.includes('previous') && !actions.includes('next')) reasons.push('Moving back needs a movement for moving next.');
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, value: { assignments: { ...assignments }, mode: actions.includes('next') ? 'step' : 'auto' } };
}

export function describeMapping(models: readonly GestureModel[], mapping: Mapping): string {
  const label = (id: string) => models.find((model) => model.id === id)?.label ?? 'Unknown movement';
  const parts = Object.entries(mapping.assignments)
    .sort(([, a], [, b]) => ACTIONS.indexOf(a) - ACTIONS.indexOf(b))
    .map(([id, action]) => `${label(id)} ${VERB[action]}`);
  return `${parts.join(' · ')}${mapping.mode === 'auto' ? ' (automatic scanning)' : ' (step by step, no timer)'}`;
}

export function sameMapping(a: Mapping | null, b: Mapping | null): boolean {
  if (!a || !b) return a === b;
  const left = Object.entries(a.assignments).sort();
  const right = Object.entries(b.assignments).sort();
  return left.length === right.length && left.every(([id, action], index) => right[index]![0] === id && right[index]![1] === action);
}

/** Deterministic proposals: each gesture as selector with the others in order, then single-gesture fallbacks. */
export function proposeMappings(models: readonly GestureModel[]): MappingProposal[] {
  const list = models.slice(0, MAX_GESTURES);
  const candidates: Assignments[] = [];
  if (list.length >= 2) {
    for (const selector of list) {
      const assignments: Assignments = { [selector.id]: 'select' };
      list.filter((model) => model !== selector).forEach((model, index) => { assignments[model.id] = SECONDARY[index]!; });
      candidates.push(assignments);
    }
  }
  for (const model of list) candidates.push({ [model.id]: 'select' });
  return candidates.flatMap((assignments, index) => {
    const result = validateMapping(list, assignments);
    return result.ok ? [{ ...result.value, id: `map:${index}`, label: describeMapping(list, result.value) }] : [];
  });
}
