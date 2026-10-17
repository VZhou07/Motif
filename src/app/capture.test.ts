import { describe, expect, it } from 'vitest';
import type { TrainingTrial } from '../domain/types';
import { TrialRecorder } from './capture';
import { frameAt } from './session.test-support';

describe('continuous five-second Rest / Action clock (R13)', () => {
  it('alternates at five-second boundaries and shares only exact neutral between attempts', () => {
    const recorder = new TrialRecorder();
    const trials: TrainingTrial[] = [];
    const changes: Array<[number, string]> = [[0, recorder.status().prompt]];
    let previous = recorder.status().prompt;
    for (let elapsed = 0; elapsed <= 25_000; elapsed += 50) {
      const update = recorder.push(frameAt(12_000 + elapsed));
      const status = recorder.status();
      if (status.prompt !== previous) { changes.push([elapsed, status.prompt]); previous = status.prompt; }
      if (elapsed % 5_000 === 0) expect(status.remainingMs).toBe(5_000);
      if (elapsed === 4_950) expect(status).toMatchObject({ prompt: 'Rest', remainingMs: 50 });
      if (update.kind === 'complete') {
        trials.push(update.value.trial);
        expect(elapsed).toBe(trials.length === 1 ? 15_000 : 25_000);
        const frames = update.value.frames;
        expect([...update.value.trial.restBefore, ...update.value.trial.movement, ...update.value.trial.restAfter]).toEqual(frames);
        expect(new Set(frames.map((frame) => frame.timestampMs)).size).toBe(frames.length);
        expect(frames.at(-1)!.timestampMs).toBe(12_000 + elapsed - 50);
      }
    }
    expect(changes).toEqual([[0, 'Rest'], [5_000, 'Action'], [10_000, 'Rest'], [15_000, 'Action'], [20_000, 'Rest'], [25_000, 'Action']]);
    expect(trials).toHaveLength(2);
    expect(trials[1]!.restBefore).toEqual(trials[0]!.restAfter);
    expect(trials[1]!.movement[0]!.timestampMs).toBe(27_000);
    expect(trials[0]!.movement.at(-1)!.timestampMs).toBe(21_950);
  });

  it('uses timestamp durations under irregular cadence, with no extra rest after completion', () => {
    const recorder = new TrialRecorder();
    const cadence = [43, 89, 71, 57];
    let elapsed = 0;
    for (let index = 0; elapsed < 15_000; index += 1) {
      recorder.push(frameAt(1_000 + elapsed));
      const status = recorder.status();
      const boundary = elapsed < 5_000 ? 5_000 : elapsed < 10_000 ? 10_000 : 15_000;
      expect(status.elapsedMs).toBe(elapsed);
      expect(status.remainingMs).toBe(boundary - elapsed);
      expect(status.prompt).toBe(elapsed >= 5_000 && elapsed < 10_000 ? 'Action' : 'Rest');
      elapsed += cadence[index % cadence.length]!;
    }
    expect(recorder.push(frameAt(1_000 + elapsed)).kind).toBe('complete');
    expect(recorder.status().prompt).toBe('Action');
    expect(recorder.status().remainingMs).toBeGreaterThan(4_800);
  });

  it('discards an interrupted action and carried rest, requiring a new full Rest', () => {
    const recorder = new TrialRecorder();
    for (let elapsed = 0; elapsed <= 16_000; elapsed += 50) recorder.push(frameAt(1_000 + elapsed));
    expect(recorder.status().prompt).toBe('Action');
    expect(recorder.push({ timestampMs: 17_050, tracking: 'missing', values: {} }).kind).toBe('interrupted');
    expect(recorder.status()).toMatchObject({ prompt: 'Rest', elapsedMs: 0, remainingMs: 5_000, overallProgress: 0 });
    recorder.push(frameAt(20_000));
    for (let elapsed = 50; elapsed <= 15_000; elapsed += 50) {
      const update = recorder.push(frameAt(20_000 + elapsed));
      if (update.kind === 'complete') expect(update.value.frames[0]!.timestampMs).toBe(20_000);
      else expect(elapsed).toBeLessThan(15_000);
    }
  });
});
