import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { Harness } from './app/session.test-support';
import type { LocalSpeech } from './app/speech';
import { TrackerError } from './tracker';

function fakeTracker(start: (...args: never[]) => Promise<void> = async () => {}) {
  return { start: vi.fn(start), stop: vi.fn() };
}

function localSpeech(h: Harness): LocalSpeech {
  return { ...h.speech, refreshVoices: () => {} };
}

function setHidden(value: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
  fireEvent(document, new Event('visibilitychange'));
}

afterEach(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});

describe('Motif app', () => {
  it('opens on a welcome screen with camera and assisted options but no communication controls', () => {
    const h = new Harness();
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Your movement/);
    expect(screen.getAllByRole('button', { name: /Start camera/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /assisted input/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Speak message/ })).toBeNull();
    expect(screen.getByText(/stays on this device/)).toBeTruthy();
  });

  it('shows the model-load failure and keeps assisted input available', async () => {
    const h = new Harness();
    const tracker = fakeTracker(async (...args: never[]) => {
      const onError = args[2] as unknown as (error: TrackerError) => void;
      const error = new TrackerError('model', 'The local face model could not load. Check model assets and retry; assisted input is available.');
      onError(error);
      throw error;
    });
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker }} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Start camera/ })[0]!);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => /could not load/.test(alert.textContent ?? ''))).toBe(true);
    expect(h.snap.camera).toBe('error');
    expect(screen.getAllByRole('button', { name: /Retry camera/ }).length).toBe(1);
    expect(screen.getByRole('button', { name: /assisted input/i })).toBeTruthy();
  });

  it('assisted Space selects the highlighted phrase, ignoring repeats and modifier chords', () => {
    const h = new Harness();
    h.speechAvailable = false;
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    fireEvent.click(screen.getByRole('button', { name: /assisted input/i }));
    const yes = screen.getByRole('button', { name: 'Add “Yes” to message' });
    expect(yes.getAttribute('aria-current')).toBe('true');
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    fireEvent.keyDown(window, { code: 'Space', key: ' ', repeat: true });
    fireEvent.keyDown(window, { code: 'Space', key: ' ', ctrlKey: true });
    expect(screen.getByRole('region', { name: 'Message' }).textContent).toContain('Yes');
    expect(h.snap.message).toEqual(['Yes']);
    expect(screen.getByText(/No local speech voice is available/)).toBeTruthy();
  });

  it('renders verified evidence and the scanned comfort decision, then advances by gesture', () => {
    const h = new Harness();
    h.calibrate();
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    expect(screen.getByText('2 / 2')).toBeTruthy();
    const current = document.querySelector('[aria-current="true"]');
    expect(current?.textContent).toBe('Yes, this movement is comfortable');
    act(() => h.selectByGesture('comfortable'));
    expect(document.querySelector('.mapping-explainer')?.textContent).toMatch(/Raise left outer eyebrow.*selects the highlighted choice/);
    act(() => h.selectByGesture('approve'));
    expect(screen.getByText(/NOTHING IS SPOKEN/)).toBeTruthy();
  });

  it('reports a hidden tab and stops the camera on unmount', () => {
    const h = new Harness();
    h.session.setCamera('running');
    const tracker = fakeTracker();
    const { unmount } = render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker }} />);
    act(() => setHidden(true));
    expect(screen.getByText('Paused while this tab is hidden')).toBeTruthy();
    unmount();
    expect(tracker.stop).toHaveBeenCalled();
  });

  it('lets a helper edit a phrase during setup and shows it on the board', () => {
    const h = new Harness();
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    const input = screen.getByRole('textbox', { name: 'Phrase 1' });
    fireEvent.change(input, { target: { value: 'Good morning' } });
    fireEvent.blur(input);
    expect(h.snap.phrases[0]).toBe('Good morning');
    fireEvent.click(screen.getByRole('button', { name: /assisted input/i }));
    expect(screen.getByRole('button', { name: 'Add “Good morning” to message' })).toBeTruthy();
  });

  it('ignores Space typed into an editable field but treats Space on a focused button as the switch', () => {
    const h = new Harness();
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    fireEvent.click(screen.getByRole('button', { name: /assisted input/i }));
    const field = document.createElement('input');
    document.body.appendChild(field);
    fireEvent.keyDown(field, { code: 'Space', key: ' ' });
    expect(h.snap.message).toEqual([]);
    field.remove();
    const pause = screen.getByRole('button', { name: /Pause/ });
    pause.focus();
    fireEvent.keyDown(pause, { code: 'Space', key: ' ' });
    expect(h.snap.message).toEqual(['Yes']);
    expect(h.snap.scan?.paused).toBe(false);
  });

  it('registers input listeners once under StrictMode double mounting', () => {
    const h = new Harness();
    render(<StrictMode><App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} /></StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: /assisted input/i }));
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(h.snap.message).toEqual(['Yes']);
  });
});
