import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import { GestureRuntime } from '../engine/recognition';
import { ScanController } from '../engine/scanner';
import { fitBaseline, fitGesture } from '../engine/calibration';
import { stream, testModel, trial } from '../engine/fixtures.test-support';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY } from './profiles';
import { defaultHoldMs, HOLD_OPTIONS, holdLabel } from './movements';
import { BROW, Harness, HEAD_WOBBLE, MOUTH, REST, type Values } from './session.test-support';
import type { LocalSpeech } from './speech';
import type { MovementChoice } from './types';
import type { MotifRuntime } from './useMotif';

// Slice H acceptance rows H.1-H.7 (UX_ACCEPTANCE.md): hold length per movement.

const EYE: Values = { eyeBlinkLeft: 0.7 };
const EYE_LABEL = 'Close left eye (hold)';
const eyeChoice = (holdMs?: number) => ({ feature: 'eyeBlinkLeft', direction: 1, label: EYE_LABEL, ...(holdMs === undefined ? {} : { holdMs }) }) as MovementChoice;
const perform = (label: string | null): Values => (label === EYE_LABEL ? EYE : label === 'Open mouth' ? MOUTH : label ? BROW : REST);
/** One ordinary blink 1 s into the everyday window (the harness clock is absolute). */
const blinkAt = (start: number, lengthMs: number) => (t: number): Values => (t - start >= 1_000 && t - start < 1_000 + lengthMs ? EYE : REST);

function mount(h: Harness) {
  return render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
    runtime: { session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: { start: vi.fn(async () => {}), stop: vi.fn() } },
  }));
}
function atChoose(h = new Harness()): Harness {
  h.session.setCamera('running');
  h.session.startBaseline();
  h.run(10_500);
  expect(h.snap.stage).toBe('choose');
  return h;
}
/** Train and verify an eye-closing movement; everyday activity is `everyday`. */
function toComfort(h: Harness, choice: MovementChoice, everyday: (t: number) => Values = HEAD_WOBBLE, everydayMs = 11_000): void {
  h.session.chooseMovement(choice);
  h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
  if (h.snap.stage === 'negative') h.run(everydayMs, everyday);
}
/** Gesture select with a hold long enough for an 800 ms model. */
const sel = (h: Harness, id: string) => h.selectByGesture(id, EYE, 90_000, 1_000, 700);
function longEyeSetup(h = new Harness()): Harness {
  atChoose(h);
  toComfort(h, eyeChoice(800));
  expect(h.snap.stage).toBe('comfort');
  return h;
}
const model = (h: Harness) => h.snap.approvedModels[0]!;

describe('H.1 fitGesture hold option', () => {
  const base = (() => { const r = fitBaseline(stream(0, 10_000)); if (!r.ok) throw new Error('baseline'); return r.value; })();
  const trials = [trial(11_000), trial(15_000), trial(19_000)];
  const fit = (activationMs?: number) => fitGesture({ baseline: base, trials, feature: 'browOuterUpLeft', direction: 1, ...(activationMs === undefined ? {} : { activationMs }) } as never);

  it('H.1 defaults to 250 ms and the chosen hold becomes the model activationMs with releaseMs unchanged', () => {
    const def = fit(); const long = fit(800); const extra = fit(1500);
    for (const result of [def, long, extra]) expect(result.ok).toBe(true);
    if (!def.ok || !long.ok || !extra.ok) return;
    expect(def.value.activationMs).toBe(250);
    expect(long.value.activationMs).toBe(800);
    expect(extra.value.activationMs).toBe(1500);
    expect([def.value.releaseMs, long.value.releaseMs, extra.value.releaseMs]).toEqual([350, 350, 350]);
  });

  it('H.1 thresholds are identical for the same trials whatever the hold', () => {
    const def = fit(); const long = fit(800);
    if (!def.ok || !long.ok) throw new Error('fit failed');
    expect({ ...long.value, activationMs: 0 }).toEqual({ ...def.value, activationMs: 0 });
  });

  it('H.1 holds outside 100-5000 ms are refused', () => {
    expect(fit(50).ok).toBe(false);
    expect(fit(6_000).ok).toBe(false);
    expect(fit(Number.NaN).ok).toBe(false);
    expect(fit(100).ok).toBe(true);
    expect(fit(5_000).ok).toBe(true);
  });
});

describe('H.2 choose screen hold choice', () => {
  it('H.2 HOLD_OPTIONS and defaults: eyes 800 ms, everything else 250 ms', () => {
    const options = HOLD_OPTIONS as ReadonlyArray<{ id: string; ms?: number }>;
    expect(options.map((option) => option.id)).toEqual(['auto', 'short', 'long', 'extra']);
    expect(options.filter((option) => option.ms !== undefined).map((option) => option.ms)).toEqual([250, 800, 1500]);
    expect(defaultHoldMs('eyeBlinkLeft')).toBe(800);
    expect(defaultHoldMs('eyeBlinkRight')).toBe(800);
    for (const feature of ['browOuterUpLeft', 'jawOpen', 'eyeWideLeft', 'headYaw', 'cheekPuff'] as const) expect(defaultHoldMs(feature)).toBe(250);
  });

  it('H.2 the choose screen has a "How long to hold" radio group, Auto selected', () => {
    const h = atChoose();
    mount(h);
    const group = screen.getByRole('radiogroup', { name: /How long to hold/ });
    const radios = [...group.querySelectorAll('input[type="radio"]')] as HTMLInputElement[];
    expect(radios).toHaveLength(4);
    expect(screen.getByRole('radio', { name: /Auto/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Short.*0\.25 s/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Long.*0\.8 s/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Extra long.*1\.5 s/ })).toBeTruthy();
    expect((screen.getByRole('radio', { name: /Auto/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('H.2 a clicked tile uses the chosen hold: Long on a brow, Auto on an eye and on a brow', () => {
    const cases: Array<[string | null, string, number]> = [['Long', 'Raise left outer eyebrow', 800], [null, EYE_LABEL, 800], [null, 'Raise left outer eyebrow', 250], ['Extra long', 'Open mouth', 1500], ['Short', EYE_LABEL, 250]];
    for (const [radio, tileLabel, expected] of cases) {
      const h = atChoose();
      const view = mount(h);
      if (radio) fireEvent.click(screen.getByRole('radio', { name: new RegExp(radio) }));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${tileLabel.replace(/[()]/g, '\\$&')}`) }));
      expect(h.snap.stage).toBe('training');
      h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
      act(() => h.run(11_000, HEAD_WOBBLE));
      expect([tileLabel, h.snap.candidate?.activationMs]).toEqual([tileLabel, expected]);
      view.unmount();
    }
  });

  it('H.2 a movement chosen from discovery uses Auto', () => {
    const h = atChoose();
    h.session.startDiscovery();
    const start = h.now;
    h.run(20_500, (now) => ((now - start - 500) % 4_000 >= 0 && (now - start - 500) % 4_000 < 1_000 ? MOUTH : REST));
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Open mouth' }));
    expect(h.snap.stage).toBe('training');
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    act(() => h.run(11_000, HEAD_WOBBLE));
    expect(h.snap.candidate?.activationMs).toBe(250);
  });
});

describe('H.3 a long hold ignores an ordinary blink', () => {
  it('H.3 with Long, a 400 ms closure selects nothing in practice and a 1 s closure selects exactly once', () => {
    const h = longEyeSetup();
    h.selectByGesture('approve-comfortable', EYE, 90_000, 1_000, 700);
    expect(h.snap.stage).toBe('practice');
    expect(model(h).activationMs).toBe(800);
    h.run(1_500, REST);
    const before = h.snap.practice.selections;
    h.run(400, EYE);
    h.run(1_500, REST);
    expect(h.snap.practice.selections).toBe(before);
    h.run(1_000, EYE);
    h.run(1_500, REST);
    expect(h.snap.practice.selections).toBe(before + 1);
  });

  it('H.3 the same holds in communication: a 400 ms closure adds nothing, a 1 s closure adds one phrase', () => {
    const h = longEyeSetup();
    sel(h, 'approve-comfortable');
    sel(h, 'finish-practice');
    expect(h.snap.stage).toBe('communication');
    h.run(1_500, REST);
    h.run(400, EYE);
    h.run(1_500, REST);
    expect(h.snap.message).toEqual([]);
    sel(h, 'phrase:0');
    expect(h.snap.message).toHaveLength(1);
  });
});

describe('H.4 verification uses the chosen hold', () => {
  it('H.4 with Long, 400 ms blinks in the everyday window are not accidental selections', () => {
    const h = new Harness();
    atChoose(h);
    h.session.chooseMovement(eyeChoice(800));
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    h.run(16_000, blinkAt(h.now, 400));
    expect(h.snap.failure?.reasons).toBeUndefined();
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.cycles.at(-1)!.negative?.eventCount).toBe(0);
  });

  it('H.4 with Short, the same blinks are counted (so setup does not pass quietly)', () => {
    const h = new Harness();
    atChoose(h);
    h.session.chooseMovement(eyeChoice(250));
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    h.run(16_000, blinkAt(h.now, 400));
    const negative = h.snap.cycles.at(-1)!.negative;
    expect(negative?.eventCount ?? 1).toBeGreaterThan(0);
    expect(h.snap.stage).not.toBe('comfort');
  });
});

describe('H.5 the hold is kept', () => {
  const stored = (storage: ReturnType<typeof createMemoryStorage>) =>
    JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.flatMap((p: { models: Array<{ activationMs: number }> }) => p.models.map((m) => m.activationMs));

  it('H.5 autosaved with the setup, and unchanged by renaming', () => {
    const storage = createMemoryStorage();
    const h = new Harness({ profiles: createLocalProfileStore(() => storage) });
    longEyeSetup(h);
    expect(h.session.renameMovement('Long wink')).toEqual({ ok: true });
    sel(h, 'approve-comfortable');
    expect(model(h).label).toBe('Long wink');
    expect(model(h).activationMs).toBe(800);
    expect(stored(storage)).toEqual([800]);
  });

  it('H.5 unchanged after Continue (quick and re-check)', () => {
    const storage = createMemoryStorage();
    const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
    longEyeSetup(first);
    sel(first, 'approve-comfortable');
    sel(first, 'finish-practice');
    for (const quick of [true, false]) {
      const h = new Harness({ profiles: createLocalProfileStore(() => storage) });
      h.session.setCamera('running');
      expect(h.session.restoreProfile('Last setup', quick)).toBe(true);
      if (!quick) {
        h.run(10_500);
        h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
        h.run(11_000, HEAD_WOBBLE);
        sel(h, 'comfortable');
      }
      sel(h, 'approve-mapping');
      expect([quick, h.snap.approvedModels.map((m) => m.activationMs)]).toEqual([quick, [800]]);
      expect(stored(storage)).toEqual([800]);
    }
  });

  it('H.5 unchanged after "same movement" recalibration', () => {
    const h = longEyeSetup();
    sel(h, 'approve-comfortable');
    sel(h, 'finish-practice');
    h.session.selectTarget('recalibrate');
    h.session.decide('start-recalibration');
    h.run(10_500);
    h.session.decide('same-movement');
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.candidate?.activationMs).toBe(800);
  });
});

describe('H.6 the hold is stated', () => {
  it('H.6 holdLabel wording', () => {
    expect(holdLabel(250)).toMatch(/short hold/);
    expect(holdLabel(800)).toMatch(/long hold, 0\.8 s/);
    expect(holdLabel(1500)).toMatch(/extra-long hold, 1\.5 s/);
  });

  it('H.6 the approve screen preview and the camera panel list state the hold with the movement', () => {
    const h = longEyeSetup();
    mount(h);
    expect(h.snap.comfortPreview?.label).toMatch(/long hold, 0\.8 s/);
    expect(document.body.textContent).toMatch(/long hold, 0\.8 s/);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and practice' }));
    expect(h.snap.stage).toBe('practice');
    expect(document.querySelector('.learned-controls')?.textContent).toMatch(/long hold, 0\.8 s/);
  });
});

describe('H.7 a long hold stays on its starting target', () => {
  it('H.7 with automatic scanning at 2 s, a 1.5 s hold that starts on a target selects that target (should already pass)', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable');
    h.selectByGesture('finish-practice');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.scanMode).toBe('auto');
    h.selectByGesture('phrase:3', BROW, 60_000, 1_500, 800);
    expect(h.snap.message).toEqual([h.snap.phrases[3]]);
  });
});

describe('H.9 only a released hold resumes the remaining scan time', () => {
  const targetAt = (scanner: ScanController, now: number) => scanner.tick(now).target;
  const fresh = () => new ScanController(['a', 'b'], 2_000, 0);
  const abandon = (scanner: ScanController, now: number) => (scanner as unknown as { abandonSelection(now: number): void }).abandonSelection(now);

  it('H.9 abandonSelection resumes the time that was left at latch start', () => {
    const scanner = fresh();
    scanner.beginSelection(100);
    abandon(scanner, 600);
    expect(scanner.snapshot.latchedTarget).toBeUndefined();
    expect(targetAt(scanner, 2_499)).toBe('a');
    expect(targetAt(scanner, 2_500)).toBe('b');
  });

  it('H.9 the resumed time is at least 0.5 s', () => {
    const scanner = fresh();
    scanner.beginSelection(1_900);
    abandon(scanner, 2_100);
    expect(targetAt(scanner, 2_599)).toBe('a');
    expect(targetAt(scanner, 2_600)).toBe('b');
  });

  it('H.9 abandoning with no latch restarts the full interval', () => {
    const scanner = fresh();
    abandon(scanner, 600);
    expect(targetAt(scanner, 2_599)).toBe('a');
    expect(targetAt(scanner, 2_600)).toBe('b');
  });

  it('H.9 commit, cancelSelection, suspend, pause, target and interval changes restart the full interval', () => {
    const cases: Array<[string, (s: ScanController) => void, number]> = [
      ['commit', (s) => { s.beginSelection(100); s.commitSelection(600); }, 2_600],
      ['cancelSelection', (s) => { s.beginSelection(100); s.cancelSelection(600); }, 2_600],
      ['suspend', (s) => { s.beginSelection(100); s.setSuspended(true, 600); s.setSuspended(false, 700); }, 2_700],
      ['pause', (s) => { s.beginSelection(100); s.setPaused(true, 600); s.setPaused(false, 700); }, 2_700],
      ['setTargets', (s) => { s.beginSelection(100); s.setTargets(['a', 'b'], 600); }, 2_600],
      ['setInterval', (s) => { s.beginSelection(100); s.setInterval(2_000, 600); }, 2_600],
    ];
    for (const [name, act, switchAt] of cases) {
      const scanner = fresh();
      act(scanner);
      expect([name, targetAt(scanner, switchAt - 1)]).toEqual([name, 'a']);
      expect([name, targetAt(scanner, switchAt)]).toEqual([name, 'b']);
    }
  });
});

describe('H.10 only substantial attempts count as unfinished', () => {
  const longModel = { ...testModel, activationMs: 800 };
  const run = (ms: number) => {
    const runtime = new GestureRuntime(longModel);
    for (const frame of stream(0, 500)) runtime.step(frame);
    let last;
    for (const frame of stream(550, ms, { browOuterUpLeft: 0.8 })) runtime.step(frame);
    last = runtime.step(makeRest(550 + ms + 50));
    return last as unknown as { cancelled: boolean; pendingMs?: number };
  };
  const makeRest = (t: number) => stream(t, 0)[0]!;

  it('H.10 a cancelled runtime update carries how long the movement was pending', () => {
    const update = run(300);
    expect(update.cancelled).toBe(true);
    expect(update.pendingMs).toBeGreaterThanOrEqual(250);
    expect(update.pendingMs).toBeLessThanOrEqual(400);
  });

  it('H.10 the session counts a release after 300 ms of an 800 ms hold as nothing, and after 500 ms as one unfinished use', () => {
    const h = longEyeSetup();
    sel(h, 'approve-comfortable');
    expect(h.snap.stage).toBe('practice');
    const use = () => h.snap.evidence.find((item) => item.label === EYE_LABEL)!.use;
    h.run(1_500, REST);
    const before = { ...use() };
    h.run(300, EYE);
    h.run(1_500, REST);
    expect(use()).toEqual(before);
    h.run(500, EYE);
    h.run(1_500, REST);
    expect(use()).toEqual({ completed: before.completed, unfinished: before.unfinished + 1 });
  });
});

describe('H.9 session wiring in communication (800 ms eye model, automatic scanning)', () => {
  /** In communication, rested until the highlight has just moved: returns the time it arrived. */
  function justMoved(): { h: Harness; target: string; t0: number } {
    const h = longEyeSetup();
    sel(h, 'approve-comfortable');
    sel(h, 'finish-practice');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.scanMode).toBe('auto');
    const first = h.highlightedId();
    while (h.highlightedId() === first) h.step(REST);
    return { h, target: h.highlightedId()!, t0: h.now };
  }

  it('H.9 letting go early keeps the highlight remaining time instead of a fresh interval', () => {
    const { h, target, t0 } = justMoved();
    h.run(1_000, REST);
    h.run(500, EYE);
    h.run(t0 + 2_700 - h.now, REST);
    expect(h.snap.message).toEqual([]);
    expect(h.highlightedId()).not.toBe(target);
  });

  it('H.9 a tracking loss in the middle of a hold restarts the full interval', () => {
    const { h, target, t0 } = justMoved();
    h.run(1_000, REST);
    h.run(300, EYE);
    h.step(REST, 'missing');
    h.run(t0 + 2_700 - h.now, REST);
    expect(h.snap.message).toEqual([]);
    expect(h.highlightedId()).toBe(target);
    h.run(1_000, REST);
    expect(h.highlightedId()).not.toBe(target);
  });
});
