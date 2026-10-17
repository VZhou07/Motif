import { describe, expect, it, vi } from 'vitest';
import { BROW, Harness } from './session.test-support';

describe('Rest / Action cue tones (R13)', () => {
  it('plays each Rest and Action transition once and never queues a hidden or muted cue', () => {
    const play = vi.fn((_tone: 'rest' | 'action') => true);
    const stop = vi.fn();
    const h = new Harness();
    h.session.setCueAudio({ play, stop });
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    play.mockClear();
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Brow' });
    const tones = () => play.mock.calls.map((call) => call[0] as string);
    expect(tones()).toEqual(['rest']);
    h.followPrompts((snap) => snap.capture?.prompt === 'Action');
    expect(tones()).toEqual(['rest', 'action']);
    h.followPrompts((snap) => snap.capture?.prompt === 'Rest' && (snap.capture?.index ?? 0) >= 1, BROW);
    expect(tones().filter((tone) => tone === 'action')).toHaveLength(1);
    expect(tones().filter((tone) => tone === 'rest').length).toBeGreaterThanOrEqual(2);
    h.session.setHidden(true, h.now);
    const beforeHidden = play.mock.calls.length;
    h.step();
    expect(play.mock.calls.length).toBe(beforeHidden);
    expect(stop).toHaveBeenCalled();
  });
});
