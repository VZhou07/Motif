import { describe, expect, it } from 'vitest';
import { TrialRecorder } from './capture';
import { frameAt } from './session.test-support';

describe('guided trial clock (R11)', () => {
  it('gives three seconds per cue and labels the same frame boundaries shown to the user', () => {
    const recorder = new TrialRecorder();
    const start = 12_000;
    expect(recorder.status()).toMatchObject({ prompt: 'Get ready', remainingMs: 3_000, nextPrompt: 'Move', overallProgress: 0 });
    for (let elapsed = 0; elapsed <= 9_000; elapsed += 50) {
      const update = recorder.push(frameAt(start + elapsed));
      if (elapsed === 2_950) expect(recorder.status()).toMatchObject({ prompt: 'Get ready', remainingMs: 50 });
      if (elapsed === 3_000) expect(recorder.status()).toMatchObject({ prompt: 'Move', remainingMs: 3_000, nextPrompt: 'Return to rest' });
      if (elapsed === 6_000) expect(recorder.status()).toMatchObject({ prompt: 'Return to rest', remainingMs: 3_000, nextPrompt: null });
      if (elapsed < 9_000) expect(update.kind).toBe('progress');
      else {
        expect(update.kind).toBe('complete');
        if (update.kind !== 'complete') throw new Error('Trial did not complete');
        const { trial, frames } = update.value;
        expect(trial.restBefore[0]!.timestampMs).toBe(start);
        expect(trial.restBefore.at(-1)!.timestampMs).toBe(start + 2_950);
        expect(trial.movement[0]!.timestampMs).toBe(start + 3_000);
        expect(trial.movement.at(-1)!.timestampMs).toBe(start + 5_950);
        expect(trial.restAfter[0]!.timestampMs).toBe(start + 6_000);
        expect(trial.restAfter.at(-1)!.timestampMs).toBe(start + 9_000);
        expect([...trial.restBefore, ...trial.movement, ...trial.restAfter]).toEqual(frames);
      }
    }
    expect(recorder.status()).toMatchObject({ prompt: 'Get ready', remainingMs: 3_000, elapsedMs: 0 });
  });

  it('uses actual timestamps with irregular frame cadence instead of counting frames', () => {
    const recorder = new TrialRecorder();
    const cadence = [43, 89, 71, 57];
    let elapsed = 0;
    for (let index = 0; elapsed < 9_000; index += 1) {
      recorder.push(frameAt(1_000 + elapsed));
      const status = recorder.status();
      const boundary = elapsed < 3_000 ? 3_000 : elapsed < 6_000 ? 6_000 : 9_000;
      expect(status.elapsedMs).toBe(elapsed);
      expect(status.remainingMs).toBe(boundary - elapsed);
      expect(status.prompt).toBe(elapsed < 3_000 ? 'Get ready' : elapsed < 6_000 ? 'Move' : 'Return to rest');
      elapsed += cadence[index % cadence.length]!;
    }
    expect(recorder.push(frameAt(1_000 + elapsed)).kind).toBe('complete');
  });

  it('discards an interrupted move and starts a full ready period from the next valid frame', () => {
    const recorder = new TrialRecorder();
    for (let elapsed = 0; elapsed <= 4_000; elapsed += 50) recorder.push(frameAt(1_000 + elapsed));
    expect(recorder.status().prompt).toBe('Move');
    expect(recorder.push({ timestampMs: 5_050, tracking: 'missing', values: {} }).kind).toBe('interrupted');
    expect(recorder.interruptions).toBe(1);
    expect(recorder.status()).toMatchObject({ prompt: 'Get ready', elapsedMs: 0, remainingMs: 3_000, overallProgress: 0 });
    recorder.push(frameAt(20_000));
    expect(recorder.status().remainingMs).toBe(3_000);
    for (let elapsed = 50; elapsed <= 9_000; elapsed += 50) {
      const update = recorder.push(frameAt(20_000 + elapsed));
      if (update.kind === 'complete') expect(update.value.frames[0]!.timestampMs).toBe(20_000);
      else expect(elapsed).toBeLessThan(9_000);
    }
  });
});
