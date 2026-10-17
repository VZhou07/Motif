import { describe, expect, it } from 'vitest';
import type { FeatureFrame, FeatureId } from '../domain/types';
import { fitBaseline } from '../engine/calibration';
import { makeFrame, stream } from '../engine/fixtures.test-support';
import { DISCOVERY, discoverCandidates } from './discovery';
import { MOVEMENT_OPTIONS } from './movements';

type Values = Partial<Record<FeatureId, number>>;

function restBaseline(overrides: Values = {}) {
  const result = fitBaseline(stream(0, 10_000, overrides));
  if (!result.ok) throw new Error(result.reasons.join());
  return result.value;
}
const baseline = restBaseline();

/** One valid segment at 50 ms steps; `at(t)` gives the overrides at time t (ms from the segment start). */
function segment(start: number, durationMs: number, at: (t: number) => Values, step = 50): FeatureFrame[] {
  return Array.from({ length: Math.floor(durationMs / step) + 1 }, (_, index) => makeFrame(start + index * step, at(index * step)));
}
/** A movement held for `holdMs` at the start of every `periodMs`, after `offsetMs`. */
const every = (periodMs: number, holdMs: number, values: Values, offsetMs = 500) => (t: number): Values =>
  (t >= offsetMs && (t - offsetMs) % periodMs < holdMs ? values : {});
const combine = (...parts: Array<(t: number) => Values>) => (t: number): Values => Object.assign({}, ...parts.map((part) => part(t)));

const MOUTH = { jawOpen: 0.7 };
const run = (at: (t: number) => Values, durationMs = 20_000) => discoverCandidates(baseline, [segment(0, durationMs, at)]);
const labels = (at: (t: number) => Values) => run(at).candidates.map((candidate) => candidate.label);

describe('free movement discovery (R9)', () => {
  it('finds nothing in rest and says so plainly', () => {
    const result = run(() => ({}));
    expect(result.candidates).toEqual([]);
    expect(result.reason).toMatch(/No repeated movement/);
    expect(result.validMs).toBe(20_000);
  });

  it('finds a repeated mouth opening and counts each hold once', () => {
    const [candidate, ...rest] = run(every(4_000, 1_000, MOUTH)).candidates;
    expect(rest).toEqual([]);
    expect(candidate).toMatchObject({ feature: 'jawOpen', direction: 1, label: 'Open mouth', episodes: 5, companions: [], alsoMoves: [], interferesWith: [] });
  });

  it('groups signals that move together into one candidate', () => {
    const [candidate, ...rest] = run(every(4_000, 1_000, { jawOpen: 0.7, mouthPucker: 0.6 })).candidates;
    expect(rest).toEqual([]);
    expect(candidate?.label).toBe('Open mouth');
    expect(candidate?.companions.map((channel) => channel.label)).toEqual(['Purse lips']);
  });

  it('keeps independent movements separate', () => {
    expect(labels(combine(every(4_000, 1_000, MOUTH), every(4_000, 1_000, { cheekPuff: 0.7 }, 2_500)))).toEqual(['Open mouth', 'Puff cheeks']);
  });

  it('does not chain two independent movements through a channel that moves with both', () => {
    const at = combine(every(6_000, 1_000, { browOuterUpLeft: 0.7, cheekPuff: 0.7 }), every(6_000, 1_000, { jawOpen: 0.7, cheekPuff: 0.7 }, 3_500));
    const result = run(at).candidates;
    const brow = result.find((candidate) => candidate.label === 'Raise left outer eyebrow');
    const mouth = result.find((candidate) => candidate.label === 'Open mouth');
    expect(brow).toBeDefined();
    expect(mouth).toBeDefined();
    expect(brow!.companions).toEqual([]);
    expect(mouth!.companions).toEqual([]);
  });

  it('never groups head turns to the left and right, even with a shared companion', () => {
    const at = combine(every(4_000, 1_000, { headYaw: 12, browInnerUp: 0.6 }), every(4_000, 1_000, { headYaw: -12, browInnerUp: 0.6 }, 2_500));
    const found = labels(at);
    expect(found).toContain('Turn head toward your left');
    expect(found).toContain('Turn head toward your right');
  });

  it('ignores a single movement, short spikes and blink-like dips', () => {
    expect(labels(every(30_000, 1_000, MOUTH))).toEqual([]);
    expect(labels(every(3_000, 300, MOUTH))).toEqual([]);
    expect(labels(every(3_300, 350, { eyeBlinkLeft: 0.8, eyeBlinkRight: 0.8 }))).toEqual([]);
    expect(labels(every(3_300, 150, { eyeBlinkLeft: 0.8 }))).toEqual([]);
  });

  it('rejects a sustained shift as posture, not a movement', () => {
    expect(labels(combine(
      (t) => (t >= 1_000 && t < 9_000 ? MOUTH : {}),
      (t) => (t >= 10_000 && t < 19_000 ? MOUTH : {}),
    ))).toEqual([]);
  });

  it('counts a hold with jitter between the thresholds once', () => {
    const jitter = (t: number): Values => {
      const phase = (t - 500) % 4_000;
      if (t < 500 || phase >= 1_000) return {};
      return { jawOpen: Math.floor(phase / 50) % 2 ? 0.7 : 0.1 + 0.006 }; // dips stay above `off`
    };
    expect(run(jitter).candidates[0]?.episodes).toBe(5);
  });

  it('never counts a hold cut by a segment end or split by a gap', () => {
    const first = segment(0, 10_000, combine(every(4_000, 1_000, MOUTH), (t) => (t >= 9_500 ? MOUTH : {})));
    const second = segment(10_300, 10_000, combine((t) => (t < 500 ? MOUTH : {}), every(4_000, 1_000, MOUTH, 2_000)));
    const [candidate] = discoverCandidates(baseline, [first, second]).candidates;
    expect(candidate?.episodes).toBe(4); // 2 + 2 clean holds; the split hold counts zero times
  });

  it('ignores sparse segments and needs ten seconds of clear tracking', () => {
    const sparse = segment(0, 20_000, every(4_000, 1_000, MOUTH), 200);
    const result = discoverCandidates(baseline, [sparse]);
    expect(result).toMatchObject({ candidates: [], validMs: 0 });
    expect(result.reason).toMatch(/Not enough clear tracking/);
    expect(run(every(2_000, 1_000, MOUTH), 9_000).reason).toMatch(/Not enough clear tracking/);
  });

  it('skips a channel that cannot reach its threshold from this rest', () => {
    const nearlyClosed = restBaseline({ eyeBlinkLeft: 0.997 });
    const at = every(4_000, 1_000, { eyeBlinkLeft: 1 });
    expect(discoverCandidates(nearlyClosed, [segment(0, 20_000, (t) => ({ eyeBlinkLeft: 0.997, ...at(t) }))]).candidates).toEqual([]);
  });

  it('uses only plain movement labels', () => {
    const at = combine(every(5_000, 1_000, { jawOpen: 0.7, mouthSmileLeft: 0.02 }), every(5_000, 1_000, { headPitch: 10 }, 2_500));
    const plainLabels = new Set(MOVEMENT_OPTIONS.map((option) => option.label));
    for (const candidate of run(at).candidates) {
      for (const channel of [candidate, ...candidate.companions, ...candidate.alsoMoves]) {
        expect(plainLabels.has(channel.label)).toBe(true);
        expect(channel.label).not.toMatch(/[a-z][A-Z]/);
      }
    }
  });

  it('when adding, drops approved movements and marks candidates that move with one', () => {
    const brow = { feature: 'browOuterUpLeft', direction: 1, label: 'Raise left outer eyebrow' } as const;
    const mouthOnly = discoverCandidates(baseline, [segment(0, 20_000, every(4_000, 1_000, MOUTH))], [{ feature: 'jawOpen', direction: 1, label: 'Open mouth' }]);
    expect(mouthOnly.candidates).toEqual([]);
    // The brow rises during two of the five mouth openings: it moves with the mouth but is not the same motion.
    const at = combine(every(4_000, 1_000, MOUTH), (t) => (t >= 500 && t < 1_500) || (t >= 4_500 && t < 5_500) ? { browOuterUpLeft: 0.7 } : {});
    const [candidate, ...rest] = discoverCandidates(baseline, [segment(0, 20_000, at)], [brow]).candidates;
    expect(rest).toEqual([]);
    expect(candidate).toMatchObject({ label: 'Open mouth', companions: [], interferesWith: ['Raise left outer eyebrow'] });
    expect(candidate?.alsoMoves.map((channel) => channel.label)).toEqual(['Raise left outer eyebrow']);
  });

  it('offers at most four candidates, deterministically', () => {
    const at = combine(
      every(10_000, 800, { browOuterUpLeft: 0.7 }, 0), every(10_000, 800, { jawOpen: 0.7 }, 2_000), every(10_000, 800, { cheekPuff: 0.7 }, 4_000),
      every(10_000, 800, { mouthPucker: 0.7 }, 6_000), every(10_000, 800, { headRoll: 12 }, 8_000),
    );
    const segments = [segment(0, 30_000, (t) => at(t + 500))];
    const first = discoverCandidates(baseline, segments);
    expect(first.candidates).toHaveLength(DISCOVERY.maxCandidates);
    expect(discoverCandidates(baseline, segments)).toEqual(first);
  });
});
