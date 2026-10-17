import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { BROW, Harness, MOUTH, REST } from './app/session.test-support';
import type { LocalSpeech } from './app/speech';
import { TrackerError } from './tracker';

function fakeTracker(start: (...args: never[]) => Promise<void> = async () => {}) {
  return { start: vi.fn(start), stop: vi.fn() };
}

function localSpeech(h: Harness): LocalSpeech {
  return { ...h.speech, refreshVoices: () => {} };
}

const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;

/** Communication with brow selecting and mouth moving next (step scanning). */
function twoMovements(): Harness {
  const h = new Harness();
  h.setUpToCommunication();
  h.addMovement(OPEN_MOUTH, (label) => (label === 'Open mouth' ? MOUTH : label ? BROW : REST));
  h.selectByGesture('comfortable');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  h.stepTo('finish-practice');
  return h;
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
    act(() => h.selectByGesture('map:0'));
    act(() => h.selectByGesture('approve-mapping'));
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

  it('lists every approved movement with what it does', () => {
    const h = twoMovements();
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    const panel = document.querySelector('.learned-controls')!;
    expect(panel.querySelector('h2')?.textContent).toBe('Your movements');
    expect([...panel.querySelectorAll('div > span')].map((node) => node.textContent)).toEqual(expect.arrayContaining(['Raise left outer eyebrow', 'Open mouth']));
    expect(panel.textContent).toMatch(/Raise left outer eyebrowSelects/);
    expect(panel.textContent).toMatch(/Open mouthMoves next/);
  });

  it('disables movements already in use while adding another', () => {
    const h = new Harness();
    h.setUpToCommunication();
    h.selectByGesture('add-movement');
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    const used = screen.getByRole('button', { name: /Raise left outer eyebrow/ }) as HTMLButtonElement;
    expect(used.disabled).toBe(true);
    expect(used.textContent).toMatch(/already in use/);
    expect((screen.getByRole('button', { name: /Raise right outer eyebrow/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('labels cross-checks in the evidence and scans the mapping proposals', () => {
    const h = new Harness();
    h.setUpToCommunication();
    h.addMovement(OPEN_MOUTH, (label) => (label === 'Open mouth' ? MOUTH : label ? BROW : REST));
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    expect(screen.getByText('Check 3 (cross-check: “Raise left outer eyebrow” still works): passed — 1 recognition')).toBeTruthy();
    expect(screen.getByText('Check 1 (new attempt: “Open mouth”): passed — 1 recognition')).toBeTruthy();
    act(() => h.selectByGesture('comfortable'));
    const proposals = [...document.querySelectorAll('[data-scan-id^="map:"]')].map((node) => node.textContent);
    expect(proposals).toHaveLength(4);
    expect(proposals[0]).toMatch(/Raise left outer eyebrow selects · Open mouth moves next/);
    act(() => { while (h.highlightedId() !== 'map:1') h.step(); });
    expect(document.querySelector('[aria-current="true"]')?.getAttribute('data-scan-id')).toBe('map:1');
    act(() => h.selectByGesture('map:1'));
    expect(document.querySelector('[data-scan-id="approve-mapping"]')).toBeTruthy();
  });
});
