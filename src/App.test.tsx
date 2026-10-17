import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY } from './app/profiles';
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
    expect(current?.textContent).toBe('Yes, comfortable and easy');
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

  it('keeps a visible note while the step fallback scans automatically', () => {
    const h = twoMovements();
    h.run(61_000);
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    expect(document.querySelector('.control-hint')?.textContent).toMatch(/scanning is automatic for now/);
  });

  it('saves the one setup automatically with no name form', () => {
    const storage = createMemoryStorage();
    const h = new Harness({ profiles: createLocalProfileStore(() => storage) });
    h.setUpToCommunication();
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    expect(screen.getByText(/saved on this device automatically/)).toBeTruthy();
    expect(screen.queryByLabelText('Profile name')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save on this device' })).toBeNull();
    expect(JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.map((profile: { name: string }) => profile.name)).toEqual(['Last setup']);
  });

  it('goes back to the start screen from communication, where Continue picks up the saved setup', () => {
    const storage = createMemoryStorage();
    const h = new Harness({ profiles: createLocalProfileStore(() => storage) });
    h.setUpToCommunication();
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    expect(screen.getByText(/when your checks last passed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done, back to start screen' }));
    expect(h.session.getSnapshot().stage).toBe('welcome');
    expect(screen.getByText(/skips the rest check and movement checks that passed within the last hour/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with your last setup' }));
    expect(h.session.getSnapshot().stage).toBe('mapping-confirm');
  });

  it('offers back to start inside assisted input started from the start screen, but not in practice', () => {
    const h = new Harness({ profiles: createLocalProfileStore(() => createMemoryStorage()) });
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use assisted input (Space switch) instead' }));
    act(() => h.session.selectTarget('practice'));
    expect(h.session.getSnapshot().stage).toBe('practice');
    expect(screen.queryByRole('button', { name: 'Done, back to start screen' })).toBeNull();
    act(() => h.session.selectTarget('finish-practice'));
    expect(h.session.getSnapshot().stage).toBe('communication');
    fireEvent.click(screen.getByRole('button', { name: 'Done, back to start screen' }));
    expect(h.session.getSnapshot()).toMatchObject({ stage: 'welcome', inputMode: 'gesture' });
  });

  it('hides back to start during practice with a movement setup', () => {
    const h = new Harness({ profiles: createLocalProfileStore(() => createMemoryStorage()) });
    h.setUpToCommunication();
    act(() => h.stepTo('practice'));
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    expect(h.session.getSnapshot().stage).toBe('practice');
    expect(screen.queryByRole('button', { name: 'Done, back to start screen' })).toBeNull();
  });

  it('offers Continue and a confirmed delete for the saved setup on the welcome screen', async () => {
    const storage = createMemoryStorage();
    const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
    first.setUpToCommunication();
    const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
    storage.setItem(PROFILE_KEY, JSON.stringify({ ...raw, profiles: [...raw.profiles, { broken: true }] }));
    const h = new Harness({ profiles: createLocalProfileStore(() => storage) });
    h.now = first.now + 60_000; // a reload within the hour, so Continue skips the checks (R17)
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    expect(screen.getByText('1 saved item could not be read and was ignored.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Continue with your last setup' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete saved setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByRole('button', { name: 'Continue with your last setup' })).toBeTruthy();
    // With the camera off, Continue starts it first, then begins the disarmed re-check.
    fireEvent.click(screen.getByRole('button', { name: 'Continue with your last setup' }));
    await waitFor(() => expect(h.snap.stage).toBe('mapping-confirm'));
    expect(h.snap.camera).toBe('running');
    expect(h.snap.restoring).toBe('Last setup');
    expect(screen.queryByRole('button', { name: 'Continue with your last setup' })).toBeNull();
  });

  it('shows per-movement evidence with denominators in the evidence panel', () => {
    const h = twoMovements();
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    const list = screen.getByRole('list', { name: 'Your movements' });
    const items = [...list.children].map((item) => item.textContent ?? '');
    expect(items[0]).toMatch(/^Raise left outer eyebrow3 of 3 required checks passed \(each had to pass\)0 accidental activations in [\d.]+ s over 2 everyday checks/);
    expect(items[1]).toMatch(/^Open mouth2 of 2 required checks passed \(each had to pass\)0 accidental activations in [\d.]+ s over 1 everyday check/);
    expect(list.textContent).not.toMatch(/%|accura|reliab/i);
  });

  it('asks which movement is tiring, then explains the recommendation and offers a helper form', () => {
    const h = twoMovements();
    act(() => h.stepTo('tiring'));
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Which movement/);
    expect(screen.getByRole('button', { name: '“Open mouth” is tiring' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '“Open mouth” is tiring' }));
    expect(h.snap.stage).toBe('mapping');
    expect(screen.getByLabelText('Why this is recommended').textContent).toMatch(/Open mouth is left unused because you reported it tiring once/);
    const [brow, mouth] = h.snap.approvedModels;
    fireEvent.change(screen.getByLabelText('Open mouth'), { target: { value: 'select' } });
    fireEvent.change(screen.getByLabelText('Raise left outer eyebrow'), { target: { value: 'pause' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review these controls' }));
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.pendingMapping?.assignments).toEqual({ [mouth!.id]: 'select', [brow!.id]: 'pause' });
  });

  it('finds movements from free exploration and lists them as suggestions', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not sure? Find my movements' }));
    expect(screen.getByText('FINDING YOUR MOVEMENTS')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Try what feels/);
    const start = h.now;
    act(() => h.run(20_500, (now) => ((now - start - 500) % 4_000 >= 0 && (now - start - 500) % 4_000 < 1_000 ? MOUTH : REST)));
    const list = screen.getByRole('list', { name: 'Noticed movements' });
    expect(list.textContent).toMatch(/Open mouth — seen 5 times/);
    expect(screen.getByText(/not proof of what you meant/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open mouth' }));
    expect(h.snap.stage).toBe('training');
    expect(h.snap.choice?.feature).toBe('jawOpen');
  });

  it('explains an empty discovery and offers to look again after a discovery failure', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.startDiscovery();
    h.run(20_500);
    render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Nothing clear/);
    expect(document.querySelector('.status-notice')?.textContent).toMatch(/No repeated movement was clear enough/);
    fireEvent.click(screen.getByRole('button', { name: 'Look again' }));
    act(() => { for (let i = 0; i < 5; i += 1) { h.run(500); h.step(REST, 'missing'); } });
    expect(h.snap.failure?.kind).toBe('discovery');
    fireEvent.click(screen.getByRole('button', { name: 'Look for movements again' }));
    expect(h.snap.stage).toBe('discover');
  });

  it('gives every control on each screen an accessible name and keeps one app announcer', () => {
    const unnamed = () => ['button', 'textbox', 'combobox', 'checkbox', 'progressbar'].flatMap((role) =>
      screen.queryAllByRole(role, { name: (name) => name.trim() === '' }).map((element) => `${role}: ${element.outerHTML.slice(0, 80)}`));
    const announcers = () => document.querySelectorAll('[aria-live]').length;
    const h = new Harness();
    h.session.setPhrase(0, 'Yes');
    const view = render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    const screens: Array<[string, () => void]> = [
      ['welcome', () => {}],
      ['rest check', () => { h.session.setCamera('running'); h.session.startBaseline(); h.run(2_000); }],
      ['choose', () => h.run(9_000)],
      ['training', () => h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Raise left outer eyebrow' })],
      ['comfort', () => { h.followPrompts((snap) => snap.stage === 'negative'); h.run(11_000, (t) => ({ headYaw: 6 * Math.sin(t / 900) })); }],
      ['mapping', () => h.selectByGesture('comfortable')],
      ['mapping confirm', () => h.selectByGesture('map:0')],
      ['practice', () => h.selectByGesture('approve-mapping')],
      ['communication', () => h.selectByGesture('finish-practice')],
      ['recalibrate', () => h.selectByGesture('recalibrate')],
      ['assisted', () => { h.selectByGesture('keep-current'); h.session.useAssisted(); }],
    ];
    const stages = ['welcome', 'baseline', 'choose', 'training', 'comfort', 'mapping', 'mapping-confirm', 'practice', 'communication', 'recalibrate-confirm', 'communication'];
    for (const [index, [name, go]] of screens.entries()) {
      act(go);
      expect([name, h.snap.stage]).toEqual([name, stages[index]]);
      expect([name, unnamed()]).toEqual([name, []]);
      expect([name, announcers()]).toEqual([name, 1]);
    }
    view.unmount();
  });

  it('names every control on the discovery, tiring, failure and saved-profile screens', () => {
    const unnamed = () => ['button', 'textbox', 'combobox', 'checkbox', 'progressbar'].flatMap((role) =>
      screen.queryAllByRole(role, { name: (name) => name.trim() === '' }).map((element) => `${role}: ${element.outerHTML.slice(0, 80)}`));
    const storage = createMemoryStorage();
    const saver = new Harness({ profiles: createLocalProfileStore(() => storage) });
    saver.setUpToCommunication();
    const h = twoMovements();
    const view = render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
    act(() => h.stepTo('tiring'));
    expect([h.snap.stage, unnamed()]).toEqual(['tiring', []]);
    view.unmount();

    const d = new Harness({ profiles: createLocalProfileStore(() => storage) });
    const second = render(<App runtime={{ session: d.session, speech: localSpeech(d), tracker: fakeTracker() }} />);
    expect([d.snap.profiles.names, unnamed()]).toEqual([['Last setup'], []]);
    act(() => { d.session.setCamera('running'); d.session.startBaseline(); d.run(10_500); d.session.startDiscovery(); });
    expect([d.snap.stage, unnamed()]).toEqual(['discover', []]);
    act(() => d.run(20_500));
    expect([d.snap.stage, unnamed()]).toEqual(['discover-results', []]);
    act(() => { d.session.decide('discover-again'); d.session.cancel(); });
    expect([d.snap.stage, unnamed()]).toEqual(['setup-failed', []]);
    second.unmount();
  });
});
