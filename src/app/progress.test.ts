import { describe, expect, it } from 'vitest';
import { setupProgress } from './progress';
import type { FailureKind, SessionSnapshot, Stage } from './types';

const base = { stage: 'baseline' as Stage, restoring: null, adding: false, recalibrating: false, candidate: null, approvedModels: [], failure: null } as unknown as Pick<SessionSnapshot, 'stage' | 'restoring' | 'adding' | 'recalibrating' | 'candidate' | 'approvedModels' | 'failure'>;
const at = (overrides: Record<string, unknown>) => setupProgress({ ...base, ...overrides } as typeof base);
const fail = (kind: FailureKind, overrides: Record<string, unknown> = {}) => at({ stage: 'setup-failed', failure: { kind, title: '', reasons: [] }, ...overrides });
const FIRST = ['Rest', 'Movement', 'Record', 'Checks', 'Everyday', 'Approve'];

describe('setupProgress', () => {
  it.each([['baseline', 0], ['choose', 1], ['discover', 1], ['discover-results', 1], ['training', 2], ['verify', 3], ['negative', 4], ['comfort', 5], ['mapping', 5], ['mapping-confirm', 5]] as const)(
    'first setup: %s is segment %i', (stage, current) => {
      expect(at({ stage, candidate: stage === 'mapping' ? {} : null })).toEqual({ segments: FIRST, current });
    });

  it('recalibrating uses the first-setup list', () => {
    expect(at({ stage: 'training', recalibrating: true, approvedModels: [{}] })).toEqual({ segments: FIRST, current: 2 });
  });

  it('adding has no Rest segment and a baseline stage while adding has no current segment', () => {
    const adding = { adding: true, approvedModels: [{}] };
    expect(at({ stage: 'choose', ...adding })).toEqual({ segments: ['Movement', 'Record', 'Checks', 'Everyday', 'Approve'], current: 0 });
    expect(at({ stage: 'comfort', ...adding })?.current).toBe(4);
    expect(at({ stage: 'baseline', ...adding })?.current).toBeNull();
  });

  it('restoring lists Rest, Re-check, Everyday, Approve', () => {
    const restoring = { restoring: 'Last setup' };
    const segments = ['Rest', 'Re-check', 'Everyday', 'Approve'];
    expect(at({ stage: 'baseline', ...restoring })).toEqual({ segments, current: 0 });
    expect(at({ stage: 'verify', ...restoring })).toEqual({ segments, current: 1 });
    expect(at({ stage: 'negative', ...restoring })).toEqual({ segments, current: 2 });
    expect(at({ stage: 'comfort', ...restoring })).toEqual({ segments, current: 3 });
    // A quick restore goes straight to Approve; earlier segments are simply passed, never claimed done.
    expect(at({ stage: 'mapping-confirm', ...restoring })).toEqual({ segments, current: 3 });
  });

  it('is hidden on tiring, recalibrate-confirm, Change controls and non-setup stages', () => {
    expect(at({ stage: 'tiring', approvedModels: [{}] })).toBeNull();
    expect(at({ stage: 'recalibrate-confirm', approvedModels: [{}] })).toBeNull();
    expect(at({ stage: 'mapping', approvedModels: [{}] })).toBeNull();
    expect(at({ stage: 'mapping-confirm', approvedModels: [{}] })).toBeNull();
    for (const stage of ['welcome', 'practice', 'communication'] as const) expect(at({ stage })).toBeNull();
  });

  it('shows the bar on mapping while adding or recalibrating with approved movements', () => {
    expect(at({ stage: 'mapping', approvedModels: [{}], adding: true, candidate: {} })?.current).toBe(4);
    expect(at({ stage: 'mapping', approvedModels: [{}], recalibrating: true })?.current).toBe(5);
  });

  it.each([['baseline', 0], ['discovery', 1], ['training', 2], ['verification', 3], ['negative', 4]] as const)('a %s failure marks segment %i', (kind, current) => {
    expect(fail(kind)).toEqual({ segments: FIRST, current });
  });

  it.each(['cancelled', 'rejected', 'profile-mismatch'] as const)('a %s failure shows the bar with nothing current', (kind) => {
    expect(fail(kind)).toEqual({ segments: FIRST, current: null });
  });

  it('a failure while adding uses the adding list', () => {
    expect(fail('verification', { adding: true, approvedModels: [{}] })).toEqual({ segments: ['Movement', 'Record', 'Checks', 'Everyday', 'Approve'], current: 2 });
  });
});
