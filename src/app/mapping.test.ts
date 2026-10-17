import { describe, expect, it } from 'vitest';
import type { GestureModel } from '../domain/types';
import { testModel } from '../engine/fixtures.test-support';
import { describeMapping, proposeMappings, sameMapping, validateMapping } from './mapping';

const models: GestureModel[] = [
  { ...testModel, id: 'brow', label: 'Brow' },
  { ...testModel, id: 'mouth', label: 'Mouth', feature: 'jawOpen' },
  { ...testModel, id: 'yaw', label: 'Yaw', feature: 'headYaw', baselineCenter: 0, activationThreshold: 5, releaseThreshold: 2 },
  { ...testModel, id: 'pucker', label: 'Pucker', feature: 'mouthPucker' },
];

describe('mapping proposals', () => {
  it.each([[1, 1], [2, 4], [3, 6], [4, 8]])('offers %i gesture(s) %i valid proposals', (count, expected) => {
    const set = models.slice(0, count);
    const proposals = proposeMappings(set);
    expect(proposals).toHaveLength(expected);
    for (const proposal of proposals) {
      expect(validateMapping(set, proposal.assignments).ok).toBe(true);
      expect(Object.values(proposal.assignments).filter((action) => action === 'select')).toHaveLength(1);
    }
    expect(new Set(proposals.map((proposal) => proposal.id)).size).toBe(expected);
  });

  it('puts full step mappings first and single-gesture automatic fallbacks last', () => {
    const proposals = proposeMappings(models.slice(0, 2));
    expect(proposals.map((proposal) => proposal.mode)).toEqual(['step', 'step', 'auto', 'auto']);
    expect(proposals[0]!.assignments).toEqual({ brow: 'select', mouth: 'next' });
    expect(proposals[1]!.assignments).toEqual({ mouth: 'select', brow: 'next' });
    expect(proposals[2]!.assignments).toEqual({ brow: 'select' });
    expect(proposals[0]!.label).toBe('Brow selects · Mouth moves next (step by step, no timer)');
    const four = proposeMappings(models)[0]!;
    expect(four.assignments).toEqual({ brow: 'select', mouth: 'next', yaw: 'previous', pucker: 'pause' });
  });

  it('rejects missing or duplicate select, duplicate actions, previous without next and unknown ids', () => {
    const set = models.slice(0, 3);
    expect(validateMapping(set, {}).ok).toBe(false);
    expect(validateMapping(set, { brow: 'next' }).ok).toBe(false);
    expect(validateMapping(set, { brow: 'select', mouth: 'select' }).ok).toBe(false);
    expect(validateMapping(set, { brow: 'select', mouth: 'next', yaw: 'next' }).ok).toBe(false);
    expect(validateMapping(set, { brow: 'select', mouth: 'previous' }).ok).toBe(false);
    expect(validateMapping(set, { brow: 'select', ghost: 'next' }).ok).toBe(false);
    expect(validateMapping(set, { brow: 'select', mouth: 'jump' as never }).ok).toBe(false);
    expect(validateMapping([...models, { ...testModel, id: 'fifth' }], { brow: 'select' }).ok).toBe(false);
    const pause = validateMapping(set, { brow: 'select', mouth: 'pause' });
    expect(pause.ok && pause.value.mode).toBe('auto');
  });

  it('compares and describes mappings independent of key order', () => {
    const a = { assignments: { brow: 'select', mouth: 'next' } as const, mode: 'step' as const };
    const b = { assignments: { mouth: 'next', brow: 'select' } as const, mode: 'step' as const };
    expect(sameMapping(a, b)).toBe(true);
    expect(sameMapping(a, { assignments: { brow: 'select' }, mode: 'auto' })).toBe(false);
    expect(sameMapping(null, null)).toBe(true);
    expect(describeMapping(models, { assignments: { brow: 'select' }, mode: 'auto' })).toBe('Brow selects (automatic scanning)');
  });
});
