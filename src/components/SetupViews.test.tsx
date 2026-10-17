import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { BROW, Harness } from '../app/session.test-support';
import { CaptureView, ChooseView, signalLevel } from './SetupViews';

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
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rest');
    fireEvent.click(screen.getByRole('button', { name: /Details/ })); // diagnostics sit behind Details
    const preview = document.querySelector('.camera-preview');
    const diagnostics = screen.getByRole('region', { name: 'Live camera diagnostics' });
    expect(preview?.contains(diagnostics)).toBe(false);
    expect(screen.getByText('Next: Move. Stay relaxed until the cue.')).toBeTruthy();
    expect(countdown().firstChild?.textContent).toBe('5');
    expect(screen.getByText('seconds')).toBeTruthy();

    act(() => h.run(1_000));
    expect(countdown().firstChild?.textContent).toBe('4');
    act(() => h.run(4_000));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Move');
    expect(countdown().firstChild?.textContent).toBe('5');
    expect(screen.getByText('seconds')).toBeTruthy();
    expect(screen.getByText('Next: Rest. Relax when the cue appears.')).toBeTruthy();

    act(() => h.run(5_000, BROW));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rest');
    expect(countdown().firstChild?.textContent).toBe('5');
    expect(screen.getByText('Next: Move. Stay relaxed until the cue.')).toBeTruthy();

    act(() => h.run(5_000));
    expect(h.snap.capture?.index).toBe(2);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Move');
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
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rest');
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
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Move');
    act(() => h.step({}, 'missing'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Rest');
    expect(countdown().firstChild?.textContent).toBe('5');
    expect(screen.getByText('Next: Move. Stay relaxed until the cue.')).toBeTruthy();
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

  it('keeps the choose screen to one short sentence before recording', () => {
    const h = new Harness();
    render(<ChooseView snapshot={h.snap} session={h.session} />);
    expect(screen.getByText(/recording starts right away/)).toBeTruthy();
    expect(screen.queryByText(/hold for about two seconds/)).toBeNull();
    expect(screen.queryByText(/5 seconds of Rest/)).toBeNull();
  });
});

describe('signal meter levels', () => {
  it('maps live deviation to none yet, none, some and strong at exact boundaries', () => {
    expect(signalLevel(null)).toBe('none yet');
    expect(signalLevel(Number.NaN)).toBe('none yet');
    expect(signalLevel(-2)).toBe('none');
    expect(signalLevel(1.49)).toBe('none');
    expect(signalLevel(1.5)).toBe('some');
    expect(signalLevel(2.99)).toBe('some');
    expect(signalLevel(3)).toBe('strong');
  });
});
