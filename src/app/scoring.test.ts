import { describe, expect, it } from 'vitest';
import type { GestureModel } from '../domain/types';
import { fitBaseline, fitGesture } from '../engine/calibration';
import { stream, trial } from '../engine/fixtures.test-support';
import { validateMapping } from './mapping';
import { describeEvidence, movementEvidence, rankMovements, recommendMapping, separationOf, type MovementEvidence } from './scoring';
import type { AttemptEvidence, CycleEvidence } from './types';

/** c = 0.02, m = 0.18: release = c + 0.25m, activation = c + 0.65m, weakest practice = c + m = 10 × c. */
const model = (id: string, label = id): GestureModel => ({ id, label, feature: 'browOuterUpLeft', direction: 1, baselineCenter: 0.1,
  releaseThreshold: 0.065, activationThreshold: 0.137, activationMs: 250, releaseMs: 350 });

const attempt = (expectedId: string, passed = true): AttemptEvidence => ({ attempt: 1, passed, eventCount: passed ? 1 : 0, validDurationMs: 7_000,
  reasons: [], expected: expectedId, expectedId, kind: 'held-out' });

function cycle(outcome: CycleEvidence['outcome'], verifiedIds: string[], heldOut: AttemptEvidence[], negative = true): CycleEvidence {
  return { cycle: 1, movement: 'x', training: { ok: true, reasons: [] }, heldOut, outcome, source: 'trained', verifiedIds,
    negative: negative ? { passed: true, eventCount: 0, validDurationMs: 10_400, restarts: 0, reasons: [] } : null };
}

function evidence(id: string, overrides: Partial<MovementEvidence> = {}): MovementEvidence {
  return { id, label: id, checks: { passed: 2, total: 2 }, everyday: { events: 0, armedMs: 10_000, windows: 1 }, separation: 5,
    effort: 'unknown', tiringReports: 0, use: { completed: 0, unfinished: 0 }, ...overrides };
}

describe('observed evidence (R8)', () => {
  it('derives the weakest practice attempt from thresholds, matching fitGesture', () => {
    expect(separationOf(model('a'))).toBeCloseTo(10, 6);
    const baseline = fitBaseline(stream(0, 10_000));
    if (!baseline.ok) throw new Error('baseline');
    const fitted = fitGesture({ baseline: baseline.value, trials: [trial(11_000), trial(15_000), trial(19_000)], feature: 'browOuterUpLeft', direction: 1 });
    if (!fitted.ok) throw new Error(fitted.reasons.join());
    const weakest = 0.65 - 0.1;
    const margin = (fitted.value.activationThreshold - fitted.value.releaseThreshold) / 0.4;
    expect(separationOf(fitted.value)).toBeCloseTo(weakest / (weakest - margin), 6);
  });

  it('gives no separation for an edited model whose derived rest ceiling is not positive', () => {
    expect(separationOf({ ...model('a'), releaseThreshold: 0.01, activationThreshold: 2 })).toBeNull();
  });

  it('counts only required checks from verified or approved setups that included the movement', () => {
    const cycles = [
      cycle('approved', ['a'], [attempt('a'), attempt('a')]),
      cycle('approved', ['a', 'b'], [attempt('b'), attempt('b'), attempt('a')]),
      cycle('failed', ['a'], [attempt('a', false)]), // failed setups never count against a movement
      cycle('verified', [], [attempt('a')]), // not verified with this movement
    ];
    const [a, b] = movementEvidence([model('a'), model('b')], cycles);
    expect(a!.checks).toEqual({ passed: 3, total: 3 });
    expect(a!.everyday).toEqual({ events: 0, armedMs: 20_800, windows: 2 });
    expect(b!.checks).toEqual({ passed: 2, total: 2 });
    expect(b!.everyday.windows).toBe(1);
    expect(a!.effort).toBe('unknown');
    expect(a!.use).toEqual({ completed: 0, unfinished: 0 });
  });

  it('attributes checks by movement id even when two movements share a name', () => {
    const cycles = [cycle('approved', ['a', 'b'], [attempt('a'), attempt('a'), attempt('b')])];
    const [a, b] = movementEvidence([model('a', 'Same name'), model('b', 'Same name')], cycles);
    expect(a!.checks.total).toBe(2);
    expect(b!.checks.total).toBe(1);
  });

  it('describes counts with denominators and never a rate or accuracy claim', () => {
    const lines = describeEvidence(evidence('Open mouth', { effort: 'easy', tiringReports: 1, use: { completed: 12, unfinished: 2 } })).join(' ');
    expect(lines).toMatch(/2 of 2 required checks passed/);
    expect(lines).toMatch(/0 accidental activations in 10\.0 s over 1 everyday check/);
    expect(lines).toMatch(/12 completed holds, 2 unfinished/);
    expect(lines).not.toMatch(/%|accura|reliab/i);
  });
});

describe('ranking and recommendation (R8)', () => {
  const order = (items: MovementEvidence[]) => rankMovements(items).map((item) => item.id);

  it('applies each key in order with approval order breaking ties', () => {
    expect(order([evidence('a', { tiringReports: 1, effort: 'easy' }), evidence('b')])).toEqual(['b', 'a']);
    expect(order([evidence('a', { effort: 'effort' }), evidence('b'), evidence('c', { effort: 'easy' })])).toEqual(['c', 'b', 'a']);
    expect(order([evidence('a', { use: { completed: 2, unfinished: 2 } }), evidence('b', { use: { completed: 10, unfinished: 1 } })])).toEqual(['b', 'a']);
    expect(order([evidence('a', { separation: null }), evidence('b', { separation: 2 }), evidence('c', { separation: 8 })])).toEqual(['c', 'b', 'a']);
    expect(order([evidence('a'), evidence('b')])).toEqual(['a', 'b']);
    expect(order([evidence('b'), evidence('a')])).toEqual(['b', 'a']);
  });

  it('applies the keys in precedence order when they disagree', () => {
    // Effort outranks use: easy with unfinished holds beats unrated with none.
    expect(order([evidence('a', { use: { completed: 5, unfinished: 0 } }), evidence('b', { effort: 'easy', use: { completed: 5, unfinished: 4 } })])).toEqual(['b', 'a']);
    // Use outranks separation.
    expect(order([evidence('a', { separation: 20, use: { completed: 5, unfinished: 3 } }), evidence('b', { separation: 2, use: { completed: 5, unfinished: 0 } })])).toEqual(['b', 'a']);
    // Tiring outranks effort.
    expect(order([evidence('a', { effort: 'easy', tiringReports: 1 }), evidence('b', { effort: 'effort' })])).toEqual(['b', 'a']);
  });

  it('compares unfinished holds relative to completed ones, not as raw counts', () => {
    expect(order([evidence('a', { use: { completed: 0, unfinished: 1 } }), evidence('b', { use: { completed: 20, unfinished: 2 } })])).toEqual(['b', 'a']);
  });

  it('recommends the best movement to select and the rest to next, previous and pause', () => {
    const models = ['a', 'b', 'c', 'd'].map((id) => model(id));
    const result = recommendMapping(models, [evidence('a'), evidence('b', { effort: 'easy' }), evidence('c'), evidence('d')])!;
    expect(result.assignments).toEqual({ b: 'select', a: 'next', c: 'previous', d: 'pause' });
    expect(validateMapping(models, result.assignments).ok).toBe(true);
    expect(result.reasons[0]).toMatch(/^b selects: you marked it easy; 2 of 2 required checks passed\.$/);
    expect(result.reasons.join(' ')).not.toMatch(/%|accura|reliab/i);
  });

  it('leaves effortful or tiring movements unused and falls back to automatic scanning', () => {
    const models = [model('a', 'Brow'), model('b', 'Mouth')];
    const tiring = recommendMapping(models, [evidence('a', { label: 'Brow' }), evidence('b', { label: 'Mouth', tiringReports: 2 })])!;
    expect(tiring.assignments).toEqual({ a: 'select' });
    const valid = validateMapping(models, tiring.assignments);
    expect(valid.ok && valid.value.mode).toBe('auto');
    expect(tiring.reasons.join(' ')).toMatch(/Mouth is left unused because you reported it tiring 2 times/);
    expect(tiring.reasons.at(-1)).toMatch(/Scanning stays automatic/);
    const effort = recommendMapping(models, [evidence('a', { effort: 'effort' }), evidence('b', { effort: 'effort' })])!;
    expect(effort.assignments).toEqual({ a: 'select' });
  });

  it('handles one movement and none', () => {
    expect(recommendMapping([model('a')], [evidence('a')])).toEqual({ assignments: { a: 'select' }, reasons: ['a selects: effort not rated; 2 of 2 required checks passed.'] });
    expect(recommendMapping([], [])).toBeNull();
  });

  it('is deterministic for the same evidence', () => {
    const models = ['a', 'b', 'c'].map((id) => model(id));
    const items = [evidence('a', { use: { completed: 3, unfinished: 1 } }), evidence('b'), evidence('c', { separation: 9 })];
    expect(recommendMapping(models, items)).toEqual(recommendMapping(models, [...items]));
  });
});
