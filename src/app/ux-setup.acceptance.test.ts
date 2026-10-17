import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import type { MotifRuntime } from './useMotif';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY } from './profiles';
import { Harness } from './session.test-support';
import type { LocalSpeech } from './speech';
import { TrackerError } from '../tracker';

// UX slice 1 acceptance rows 1.1-1.7 (UX_ACCEPTANCE.md). Uses the real App with a fake tracker.

function fakeTracker(start: (...args: never[]) => Promise<void> = async () => {}) {
  return { start: vi.fn(start), stop: vi.fn() };
}
function localSpeech(h: Harness): LocalSpeech {
  return { ...h.speech, refreshVoices: () => {} };
}
function mount(h: Harness, tracker = fakeTracker()) {
  const view = render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, { runtime: { session: h.session, speech: localSpeech(h), tracker } }));
  return { view, tracker };
}
/** A harness whose storage already holds the automatic saved setup (resting numbers included). */
function withSavedSetup(): Harness {
  const storage = createMemoryStorage();
  const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
  first.setUpToCommunication();
  return new Harness({ profiles: createLocalProfileStore(() => storage) });
}
const getStarted = () => screen.queryAllByRole('button', { name: /^Get started/ });

afterEach(() => vi.useRealTimers());

describe('1.1 Get started', () => {
  it('1.1 offers exactly one primary "Get started" with no saved setup', () => {
    mount(new Harness());
    const buttons = getStarted();
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.className).toMatch(/button-primary/);
  });

  it('1.1 one click starts the tracker once and reaches the baseline stage with no further click', async () => {
    const h = new Harness();
    const { tracker } = mount(h);
    fireEvent.click(getStarted()[0]!);
    await waitFor(() => expect(h.snap.stage).toBe('baseline'));
    expect(h.snap.camera).toBe('running');
    expect(tracker.start).toHaveBeenCalledTimes(1);
  });

  it('1.1 a second click while the camera is loading does not start a second tracker', async () => {
    const h = new Harness();
    let release!: () => void;
    const tracker = fakeTracker(() => new Promise<void>((resolve) => { release = resolve; }));
    mount(h, tracker);
    fireEvent.click(getStarted()[0]!);
    await waitFor(() => expect(h.snap.camera).toBe('loading'));
    for (const button of screen.queryAllByRole('button', { name: /Get started|Starting camera/ })) fireEvent.click(button);
    expect(tracker.start).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    await waitFor(() => expect(h.snap.stage).toBe('baseline'));
    expect(tracker.start).toHaveBeenCalledTimes(1);
  });

  it('1.1 a stale start that resolves after the camera was stopped does not begin the rest check', async () => {
    const h = new Harness();
    const { tracker } = mount(h);
    // Simulate Stop being pressed in the instant the camera reports running, before Get started continues.
    let stopped = false;
    const unsubscribe = h.session.subscribe(() => {
      if (!stopped && h.session.getSnapshot().camera === 'running') { stopped = true; h.session.setCamera('off'); }
    });
    fireEvent.click(getStarted()[0]!);
    await waitFor(() => expect(stopped).toBe(true));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    unsubscribe();
    expect(tracker.start).toHaveBeenCalledTimes(1);
    expect(h.snap.camera).toBe('off');
    expect(h.snap.stage).toBe('welcome');
  });
});

describe('1.2 camera failure', () => {
  it('1.2 stays on the start screen with the error, no rest check, and offers Retry camera', async () => {
    const h = new Harness();
    const tracker = fakeTracker(async () => { throw new TrackerError('permission', 'Camera permission was denied.'); });
    mount(h, tracker);
    fireEvent.click(getStarted()[0]!);
    await waitFor(() => expect(h.snap.camera).toBe('error'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(h.snap.stage).toBe('welcome');
    expect(screen.getAllByText(/Camera permission was denied/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Retry camera/ }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /assisted input/i })).toBeTruthy();
  });

  it('1.2 Retry camera starts the tracker again and then the rest check', async () => {
    const h = new Harness();
    let calls = 0;
    const tracker = fakeTracker(async () => { calls += 1; if (calls === 1) throw new TrackerError('camera', 'No camera was found.'); });
    mount(h, tracker);
    fireEvent.click(getStarted()[0]!);
    await waitFor(() => expect(h.snap.camera).toBe('error'));
    fireEvent.click(screen.getAllByRole('button', { name: /Retry camera/ })[0]!);
    await waitFor(() => expect(h.snap.stage).toBe('baseline'));
    expect(tracker.start).toHaveBeenCalledTimes(2);
  });
});

describe('1.3 saved setup', () => {
  it('1.3 keeps Continue primary and Set up again secondary', () => {
    mount(withSavedSetup());
    const cont = screen.getByRole('button', { name: 'Continue with your last setup' });
    const again = screen.getByRole('button', { name: 'Set up again' });
    expect(cont.className).toMatch(/button-primary/);
    expect(again.className).not.toMatch(/button-primary/);
    expect(getStarted()).toHaveLength(0);
  });

  it('1.3 Set up again starts the camera, then the rest check, restoring nothing', async () => {
    const h = withSavedSetup();
    const { tracker } = mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Set up again' }));
    await waitFor(() => expect(h.snap.stage).toBe('baseline'));
    expect(h.snap.camera).toBe('running');
    expect(h.snap.restoring).toBeNull();
    expect(h.snap.approvedModels).toHaveLength(0);
    expect(tracker.start).toHaveBeenCalledTimes(1);
  });

  it('1.3 Continue still restores the saved setup', async () => {
    const h = withSavedSetup();
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with your last setup' }));
    await waitFor(() => expect(h.snap.stage).toBe('mapping-confirm'));
    expect(h.snap.restoring).toBe('Last setup');
  });
});

describe('1.4 one start-camera control', () => {
  it('1.4 with no saved setup the start screen has no separate "Start camera" button', () => {
    mount(new Harness());
    expect(screen.queryAllByRole('button', { name: /Start camera/ })).toHaveLength(0);
    expect(getStarted()).toHaveLength(1);
  });

  it('1.4 other stages with the camera off still offer Start camera in the camera panel', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(2_000);
    act(() => h.session.setCamera('off'));
    mount(h);
    expect(h.snap.stage).not.toBe('welcome');
    expect(screen.getAllByRole('button', { name: /Start camera/ })).toHaveLength(1);
  });
});

describe('1.5 start-screen copy', () => {
  it('1.5 states what happens and roughly how long', () => {
    mount(new Harness());
    expect(document.body.textContent).toMatch(/1½ minutes|1\.5 minutes/);
    expect(document.body.textContent).toMatch(/rest/i);
  });

  it('1.5 the saved-setup text no longer claims Continue repeats the rest check', () => {
    mount(withSavedSetup());
    const section = screen.getByRole('region', { name: /Saved on this device/ });
    expect(section.textContent).not.toMatch(/repeats the ten-second rest check/i);
    expect(section.textContent).not.toMatch(/repeat\w*[^.]*rest check/i);
  });
});

describe('1.6 assisted input and helper settings unchanged', () => {
  it('1.6 Use assisted input and Helper settings are present on the start screen', () => {
    const h = new Harness();
    mount(h);
    expect(screen.getByRole('button', { name: /Use assisted input/ })).toBeTruthy();
    expect(screen.getByText(/Helper settings/)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Phrase 1' })).toBeTruthy();
  });

  it('1.6 Use assisted input still enters assisted mode without starting the camera', () => {
    const h = new Harness();
    const { tracker } = mount(h);
    fireEvent.click(screen.getByRole('button', { name: /Use assisted input/ }));
    expect(h.snap.inputMode).toBe('assisted');
    expect(tracker.start).not.toHaveBeenCalled();
  });
});

describe('1.5 legacy profile', () => {
  function savedWith(baseline: boolean): Harness {
    const storage = createMemoryStorage();
    const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
    first.setUpToCommunication();
    if (!baseline) {
      const raw = JSON.parse(storage.data.get(PROFILE_KEY)!);
      for (const profile of raw.profiles) delete profile.baseline;
      storage.setItem(PROFILE_KEY, JSON.stringify(raw));
    }
    return new Harness({ profiles: createLocalProfileStore(() => storage) });
  }
  it('1.5 a saved profile without resting numbers keeps the wording that Continue re-checks the rest', () => {
    mount(savedWith(false));
    const section = screen.getByRole('region', { name: /Saved on this device/ });
    expect(section.textContent).toMatch(/rest check|re-?checks? the rest|repeats/i);
  });
  it('1.5 a saved profile with resting numbers does not claim a rest check', () => {
    mount(savedWith(true));
    const section = screen.getByRole('region', { name: /Saved on this device/ });
    expect(section.textContent).not.toMatch(/rest check|re-?checks? the rest|repeats/i);
  });
});

describe('1.7 names, error announcement and focus', () => {
  it('1.7 every control on the start screen has an accessible name (plain and saved)', () => {
    const unnamed = () => ['button', 'textbox', 'combobox', 'checkbox'].flatMap((role) =>
      screen.queryAllByRole(role, { name: (name) => name.trim() === '' }).map((el) => el.outerHTML.slice(0, 80)));
    const plain = mount(new Harness());
    expect(getStarted()).toHaveLength(1);
    expect(unnamed()).toEqual([]);
    plain.view.unmount();
    mount(withSavedSetup());
    expect(screen.getByRole('button', { name: 'Set up again' })).toBeTruthy();
    expect(unnamed()).toEqual([]);
  });

  it('1.7 the camera error is in a status/alert element and focus stays on the retry button', async () => {
    const h = new Harness();
    mount(h, fakeTracker(async () => { throw new TrackerError('permission', 'Camera permission was denied.'); }));
    const button = getStarted()[0]!;
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(h.snap.camera).toBe('error'));
    const live = [...screen.queryAllByRole('alert'), ...screen.queryAllByRole('status')];
    expect(live.some((el) => /Camera permission was denied/.test(el.textContent ?? ''))).toBe(true);
    const active = document.activeElement as HTMLElement;
    expect(active.tagName).toBe('BUTTON');
    expect(active.textContent).toMatch(/Retry camera/);
  });
});

describe('1.9 concurrent starts', () => {
  it('1.9 two synchronous clicks on Get started call tracker.start once', async () => {
    const h = new Harness();
    const { tracker } = mount(h);
    const button = getStarted()[0]!;
    act(() => { button.click(); button.click(); });
    await waitFor(() => expect(h.snap.stage).toBe('baseline'));
    expect(tracker.start).toHaveBeenCalledTimes(1);
  });

  it('1.9 two synchronous starts from the saved-setup buttons call tracker.start once', async () => {
    const h = withSavedSetup();
    const { tracker } = mount(h);
    const cont = screen.getByRole('button', { name: 'Continue with your last setup' });
    const again = screen.getByRole('button', { name: 'Set up again' });
    act(() => { cont.click(); again.click(); });
    await waitFor(() => expect(h.snap.camera).toBe('running'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(tracker.start).toHaveBeenCalledTimes(1);
  });
});

describe('1.10 no rest check after the situation changed', () => {
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  function pending() {
    const ctl: { release: () => void; onError?: (error: TrackerError) => void } = { release: () => {} };
    const tracker = fakeTracker((...args: never[]) => new Promise<void>((resolve) => {
      ctl.onError = args[2] as unknown as (error: TrackerError) => void;
      ctl.release = resolve;
    }));
    return { ctl, tracker };
  }

  it('1.10 assisted input pressed while the camera loads: no rest check', async () => {
    const h = new Harness();
    const { ctl, tracker } = pending();
    mount(h, tracker);
    fireEvent.click(getStarted()[0]!);
    await waitFor(() => expect(h.snap.camera).toBe('loading'));
    fireEvent.click(screen.getByRole('button', { name: /Use assisted input/ }));
    expect(h.snap.inputMode).toBe('assisted');
    ctl.release();
    await settle();
    expect(h.snap.stage).not.toBe('baseline');
    expect(h.snap.inputMode).toBe('assisted');
  });

  it('1.10 tracker error callback fired during start: no rest check', async () => {
    const h = new Harness();
    const { ctl, tracker } = pending();
    mount(h, tracker);
    fireEvent.click(getStarted()[0]!);
    await waitFor(() => expect(h.snap.camera).toBe('loading'));
    act(() => ctl.onError!(new TrackerError('inference', 'Tracking stopped.')));
    ctl.release();
    await settle();
    expect(h.snap.stage).toBe('welcome');
  });

  it('1.10 unmounted before start resolves: no rest check', async () => {
    const h = new Harness();
    const { ctl, tracker } = pending();
    const { view } = mount(h, tracker);
    fireEvent.click(getStarted()[0]!);
    await waitFor(() => expect(h.snap.camera).toBe('loading'));
    view.unmount();
    ctl.release();
    await settle();
    expect(h.snap.stage).toBe('welcome');
  });
});
