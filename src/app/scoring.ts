import type { GestureModel } from '../domain/types';
import { ACTIVATION_FRACTION, RELEASE_FRACTION } from '../engine/calibration';
import type { Assignments, ControlAction } from './mapping';
import type { CycleEvidence } from './types';

/**
 * Observed evidence and comfort-aware recommendations (R8). Everything here is a count with
 * its denominator from this session; nothing is a rate, accuracy or population claim.
 */
export type Effort = 'easy' | 'effort' | 'unknown';
export interface MovementUse { completed: number; unfinished: number }
export interface MovementNotes { effort?: Effort; tiringReports?: number }

export interface MovementEvidence {
  id: string;
  label: string;
  /** Required checks in verified/approved setups that included this movement (each had to pass). */
  checks: { passed: number; total: number };
  everyday: { events: number; armedMs: number; windows: number };
  /** Weakest practice attempt as a multiple of resting variation, from the frozen thresholds; null if not derivable. */
  separation: number | null;
  effort: Effort;
  tiringReports: number;
  use: MovementUse;
}

export interface Recommendation { assignments: Assignments; reasons: string[] }

/** Inverts fitGesture: release = c + R·m, activation = c + A·m, so m = (act − rel)/(A − R), c = rel − R·m. */
export function separationOf(model: GestureModel): number | null {
  const margin = (model.activationThreshold - model.releaseThreshold) / (ACTIVATION_FRACTION - RELEASE_FRACTION);
  const ceiling = model.releaseThreshold - RELEASE_FRACTION * margin;
  if (!(ceiling > 0) || !(margin > 0)) return null;
  const ratio = (ceiling + margin) / ceiling;
  return Number.isFinite(ratio) ? ratio : null;
}

export function movementEvidence(models: readonly GestureModel[], cycles: readonly CycleEvidence[],
  notes: Readonly<Record<string, MovementNotes>> = {}, use: Readonly<Record<string, MovementUse>> = {}): MovementEvidence[] {
  return models.map((model) => {
    const gates = cycles.filter((cycle) => (cycle.outcome === 'verified' || cycle.outcome === 'approved') && cycle.verifiedIds.includes(model.id));
    const attempts = gates.flatMap((cycle) => cycle.heldOut.filter((attempt) => attempt.expectedId === model.id));
    const windows = gates.flatMap((cycle) => (cycle.negative ? [cycle.negative] : []));
    return {
      id: model.id, label: model.label,
      checks: { passed: attempts.filter((attempt) => attempt.passed).length, total: attempts.length },
      everyday: { events: windows.reduce((sum, window) => sum + window.eventCount, 0),
        armedMs: windows.reduce((sum, window) => sum + window.validDurationMs, 0), windows: windows.length },
      separation: separationOf(model),
      effort: notes[model.id]?.effort ?? 'unknown',
      tiringReports: notes[model.id]?.tiringReports ?? 0,
      use: { ...(use[model.id] ?? { completed: 0, unfinished: 0 }) },
    };
  });
}

const EFFORT_RANK: Record<Effort, number> = { easy: 0, unknown: 1, effort: 2 };

/** R8 revision 2 keys, in order; the input order (approval order) breaks ties. */
export function rankMovements(evidence: readonly MovementEvidence[]): MovementEvidence[] {
  return evidence.map((item, order) => ({ item, order })).sort((a, b) => {
    const x = a.item;
    const y = b.item;
    return (x.tiringReports - y.tiringReports)
      || (EFFORT_RANK[x.effort] - EFFORT_RANK[y.effort])
      || (x.use.unfinished * (y.use.completed + 1) - y.use.unfinished * (x.use.completed + 1))
      || ((y.separation ?? -1) - (x.separation ?? -1))
      || (a.order - b.order);
  }).map(({ item }) => item);
}

const SECONDARY: readonly ControlAction[] = ['next', 'previous', 'pause'];
const VERB: Record<ControlAction, string> = { select: 'selects', next: 'moves next', previous: 'moves back', pause: 'pauses or resumes' };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function basis(item: MovementEvidence): string {
  const parts = [
    item.effort === 'easy' ? 'you marked it easy' : item.effort === 'effort' ? 'you marked it as taking effort' : 'effort not rated',
    `${item.checks.passed} of ${item.checks.total} required checks passed`,
  ];
  if (item.use.completed || item.use.unfinished) parts.push(`${plural(item.use.completed, 'completed hold')} and ${item.use.unfinished} unfinished this session`);
  return parts.join('; ');
}

export function recommendMapping(models: readonly GestureModel[], evidence: readonly MovementEvidence[]): Recommendation | null {
  const ranked = rankMovements(evidence.filter((item) => models.some((model) => model.id === item.id)));
  const best = ranked[0];
  if (!best) return null;
  const assignments: Assignments = { [best.id]: 'select' };
  const reasons = [`${best.label} selects: ${basis(best)}.`];
  let slot = 0;
  for (const item of ranked.slice(1)) {
    if (item.effort === 'effort' || item.tiringReports > 0) {
      const why = item.tiringReports > 0 ? `you reported it tiring ${item.tiringReports === 1 ? 'once' : `${item.tiringReports} times`}` : 'you marked it as taking effort';
      reasons.push(`${item.label} is left unused because ${why}. It still makes simultaneous movements wait, so nothing is selected by accident.`);
      continue;
    }
    const action = SECONDARY[slot];
    if (!action) break;
    slot += 1;
    assignments[item.id] = action;
    reasons.push(`${item.label} ${VERB[action]}: ${basis(item)}.`);
  }
  if (ranked.length > 1 && slot === 0) reasons.push('Scanning stays automatic, so only the select movement is needed.');
  return { assignments, reasons };
}

/** Plain lines for the evidence panel: counts with denominators only. */
export function describeEvidence(item: MovementEvidence): string[] {
  return [
    `${item.checks.passed} of ${item.checks.total} required checks passed (each had to pass)`,
    `${plural(item.everyday.events, 'accidental activation')} in ${(item.everyday.armedMs / 1_000).toFixed(1)} s over ${plural(item.everyday.windows, 'everyday check')}`,
    item.separation === null ? 'Practice strength: not available' : `Weakest practice attempt: ${item.separation.toFixed(1)}× your resting variation`,
    `Effort: ${item.effort === 'easy' ? 'easy' : item.effort === 'effort' ? 'takes effort' : 'not rated'}${item.tiringReports ? `; reported tiring ${plural(item.tiringReports, 'time')}` : ''}`,
    `This session: ${plural(item.use.completed, 'completed hold')}, ${item.use.unfinished} unfinished`,
  ];
}
