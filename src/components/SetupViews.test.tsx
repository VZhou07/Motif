import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { BROW, Harness } from '../app/session.test-support';
import { CaptureView, ChooseView } from './SetupViews';

function renderApp(h: Harness) {
  return render(<App runtime={{
    session: h.session,
    speech: { ...h.speech, refreshVoices: () => {} },
    tracker: { start: async () => {}, stop: () => {} },
  }} />);
}

function startTrial(): Harness {
  const h = new Harness();
  h.session.setCamera('running');
  h.session.startBaseline();
  h.run(10_500);
  h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'My eyebrow movement' });
  h.step();
  return h;
}

function countdown(): Element {
  const timer = document.querySelector('.timer');
  if (!timer) throw new Error('No visible recording countdown');
  return timer;
}

describe('calibration pacing presentation (R13)', () => {
  it('alternates five-second Rest and Action cues without another ready or return step', () => {
    const h = startTrial();
    renderApp(h);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rest comfortably.');
    const preview = document.querySelector('.camera-preview');
    const diagnostics = screen.getByRole('region', { name: 'Live camera diagnostics' });
    expect(preview?.contains(diagnostics)).toBe(false);
    expect(screen.getByText('Next: Action. Stay relaxed until the Action cue.')).toBeTruthy();
    expect(countdown().firstChild?.textContent).toBe('5');
    expect(screen.getByText('seconds until action')).toBeTruthy();

    act(() => h.run(1_000));
    expect(countdown().firstChild?.textContent).toBe('4');
    act(() => h.run(4_000));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Make your movementand hold it.');
    expect(countdown().firstChild?.textContent).toBe('5');
    expect(screen.getByText('seconds until rest')).toBeTruthy();
    expect(screen.getByText('Next: Rest. Relax when the Rest cue appears.')).toBeTruthy();

    act(() => h.run(5_000, BROW));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rest comfortably.');
    expect(countdown().firstChild?.textContent).toBe('5');
    expect(screen.getByText('Next: Action. Stay relaxed until the Action cue.')).toBeTruthy();

    act(() => h.run(5_000));
    expect(h.snap.capture?.index).toBe(2);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Make your movementand hold it.');
    expect(countdown().firstChild?.textContent).toBe('5');
    expect(screen.queryByText('Get ready')).toBeNull();
    expect(screen.queryByText('Return to rest')).toBeNull();
  });

  it('keeps the baseline at ten seconds without a movement preview', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.step();
    renderApp(h);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rest comfortably.');
    expect(countdown().firstChild?.textContent).toBe('10');
    expect(screen.queryByText(/^Next:/)).toBeNull();
    act(() => h.run(3_000));
    expect(countdown().firstChild?.textContent).toBe('7');
    expect(h.snap.stage).toBe('baseline');
    act(() => h.run(7_000));
    expect(h.snap.stage).toBe('choose');
  });

  it('uses the recorder remaining time even when phase progress describes another proportion', () => {
    const h = startTrial();
    const snapshot = h.snap;
    if (!snapshot.capture) throw new Error('Trial did not start');
    // This boundary tests the view contract: progress belongs to the progress bar,
    // while countdown time comes from the recorder, never inferred from a label.
    render(<CaptureView session={h.session} snapshot={{ ...snapshot,
      capture: { ...snapshot.capture, phaseProgress: 0, remainingMs: 1_900 },
    }} />);
    expect(countdown().firstChild?.textContent).toBe('2');
  });

  it('shows a fresh five-second Rest after tracking interrupts Action', () => {
    const h = startTrial();
    h.run(5_500);
    renderApp(h);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Make your movementand hold it.');
    act(() => h.step({}, 'missing'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rest comfortably.');
    expect(countdown().firstChild?.textContent).toBe('5');
    expect(screen.getByText('Next: Action. Stay relaxed until the Action cue.')).toBeTruthy();
    expect(h.snap.capture?.index).toBe(1);
    expect(h.snap.capture?.interruptions).toBe(1);
  });

  it('keeps changing countdown digits out of live announcements', () => {
    const h = startTrial();
    renderApp(h);
    const announcer = document.querySelector('[aria-live]');
    expect(announcer?.textContent).toBe('Rest');
    const initialAnnouncement = announcer?.textContent;
    act(() => h.run(1_000));
    expect(countdown().firstChild?.textContent).toBe('4');
    expect(countdown().getAttribute('aria-hidden')).toBe('true');
    expect(countdown().closest('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(announcer?.textContent).toBe(initialAnnouncement);
    act(() => h.run(4_000));
    expect(announcer?.textContent).toBe('Action');
    expect(announcer?.textContent).not.toMatch(/\d/);
  });

  it('explains the same two-cue rhythm before recording', () => {
    const h = new Harness();
    render(<ChooseView snapshot={h.snap} session={h.session} />);
    expect(screen.getByText(/5 seconds of Rest, then 5 seconds of Action/)).toBeTruthy();
    expect(screen.queryByText(/hold for about two seconds/)).toBeNull();
    expect(screen.getByText(/hold until the Rest cue/)).toBeTruthy();
  });
});
