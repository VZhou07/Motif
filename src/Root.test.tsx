import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CareService, type CareCredential, type CareTransport } from './care/client';
import type { CareState } from './app/care';
import { Harness } from './app/session.test-support';
import type { LocalSpeech } from './app/speech';
import Root from './Root';

const trackerBuilt = vi.hoisted(() => ({ count: 0 }));
vi.mock('./tracker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tracker')>();
  class CountingTracker extends actual.FaceTracker { constructor() { super(); trackerBuilt.count += 1; } }
  return { ...actual, FaceTracker: CountingTracker };
});

function fakeTracker() { return { start: vi.fn(async () => {}), stop: vi.fn() }; }
function localSpeech(h: Harness): LocalSpeech { return { ...h.speech, cancel: vi.fn(), refreshVoices: () => {} }; }
function go(hash: string) { act(() => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); }); }
function setHidden(value: boolean) { Object.defineProperty(document, 'hidden', { configurable: true, get: () => value }); }

/** The real shared CareService over a test transport standing in for Supabase. */
function careFor(credential: CareCredential | null, access?: Record<string, unknown>): CareState {
  const transport: CareTransport = {
    auth: { credential: async () => credential, signIn: async () => {}, signInAnonymous: async () => {}, signOut: async () => {}, onChange: () => () => {} },
    rpc: async (name) => { if (name === 'motif_access' && access) return access; throw new Error(`unexpected ${name}`); },
    list: async () => [],
  };
  return { status: 'ready', client: new CareService(transport) };
}

beforeEach(() => { trackerBuilt.count = 0; window.location.hash = ''; setHidden(false); });
afterEach(() => { window.location.hash = ''; setHidden(false); });

describe('role-aware routes', () => {
  it('opens the participant surface by default with a link to the caregiver page', () => {
    const h = new Harness();
    render(<Root runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} care={{ status: 'not-configured' }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Your movement/);
    expect(screen.getByRole('link', { name: 'Caregiver dashboard' }).getAttribute('href')).toBe('#/caregiver');
  });

  it('mounts the real dashboard on #/caregiver without building a camera tracker or asking for the camera', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
    window.location.hash = '#/caregiver';
    render(<StrictMode><Root care={careFor(null)} /></StrictMode>);
    expect(await screen.findByRole('heading', { name: 'Caregiver sign-in' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Caregiver dashboard' })).toBeTruthy();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByText(/No camera is used on this page/)).toBeTruthy();
    expect(trackerBuilt.count).toBe(0);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('builds the real tracker only on the participant surface (control for the previous test)', () => {
    render(<Root care={{ status: 'not-configured' }} />);
    expect(trackerBuilt.count).toBeGreaterThan(0);
  });

  it('explains missing configuration and sends nothing', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    window.location.hash = '#/caregiver';
    render(<Root care={{ status: 'not-configured' }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The caregiver dashboard is not set up yet');
    expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the safe invalid-configuration message', () => {
    window.location.hash = '#/caregiver';
    render(<Root care={{ status: 'invalid', message: 'Care networking is disabled: provide a valid Supabase project URL.' }} />);
    expect(screen.getByText(/Care networking is disabled/)).toBeTruthy();
  });

  it('a participant session on the caregiver page sees no caregiver data: the route grants nothing', async () => {
    const userId = '00000000-0000-4000-8000-0000000000a1';
    const participant = { id: '00000000-0000-4000-8000-0000000000b1', group_id: '00000000-0000-4000-8000-0000000000c1', alias: 'Alex', user_id: userId, revoked_at: null, created_at: '2026-10-17T10:00:00.000Z' };
    window.location.hash = '#/caregiver';
    render(<Root care={careFor({ token: 't', userId, anonymous: true }, { version: 1, role: 'participant', group: null, participant, receiver_name: 'Sam' })} />);
    expect(await screen.findByRole('heading', { name: 'This device is not signed in as a caregiver' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Open requests/ })).toBeNull();
    expect(screen.queryByText('Alex')).toBeNull();
  });

  it('keeps the participant setup across a caregiver visit but stops the camera, speech and input', () => {
    const h = new Harness();
    h.setUpToCommunication();
    h.session.setCamera('running');
    const tracker = fakeTracker();
    const speech = localSpeech(h);
    const setCues = vi.spyOn(h.session, 'setCueAudio');
    render(<StrictMode><Root runtime={{ session: h.session, speech, tracker }} care={{ status: 'not-configured' }} /></StrictMode>);
    expect(setCues.mock.calls.at(-1)?.[0]).not.toBeNull();
    const mapping = h.snap.mapping;
    go('#/caregiver');
    expect(tracker.stop).toHaveBeenCalled();
    expect(speech.cancel).toHaveBeenCalled();
    expect(setCues.mock.calls.at(-1)?.[0]).toBeNull();
    expect(h.snap.camera).toBe('off');
    expect(h.snap.runtime?.armed ?? false).toBe(false);
    go('#/');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.mapping).toEqual(mapping);
    expect(setCues.mock.calls.at(-1)?.[0]).not.toBeNull();
    expect(h.snap.camera).toBe('off');
    // Frames without restarting the camera do nothing.
    const message = [...h.snap.message];
    h.run(1_500, { browOuterUpLeft: 0.7 });
    expect(h.snap.message).toEqual(message);
  });

  it('keeps the real default participant session across a caregiver visit', () => {
    render(<Root care={{ status: 'not-configured' }} />);
    fireEvent.click(screen.getByRole('button', { name: /assisted input/i }));
    expect(screen.getByText('Assisted switch')).toBeTruthy();
    go('#/caregiver');
    go('#/');
    expect(screen.getByText('Assisted switch')).toBeTruthy();
  });

  it('suspends assisted scanning while away and resumes in place without selecting', () => {
    vi.useFakeTimers();
    try {
      const h = new Harness();
      render(<Root runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} care={{ status: 'not-configured' }} />);
      fireEvent.click(screen.getByRole('button', { name: /assisted input/i }));
      const index = h.snap.scan!.index;
      go('#/caregiver');
      expect(h.snap.scan?.suspended).toBe(true);
      act(() => { vi.advanceTimersByTime(30_000); });
      expect(h.snap.scan!.index).toBe(index);
      go('#/');
      expect(h.snap.scan?.suspended).toBe(false);
      expect(h.snap.scan!.index).toBe(index);
      expect(h.snap.message).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it('stays suspended when returning while the page is hidden', () => {
    const h = new Harness();
    render(<Root runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} care={{ status: 'not-configured' }} />);
    fireEvent.click(screen.getByRole('button', { name: /assisted input/i }));
    go('#/caregiver');
    setHidden(true);
    go('#/');
    expect(h.snap.scan?.suspended).toBe(true);
  });

  it('Space on the focused caregiver link neither navigates nor selects outside assisted mode', () => {
    const h = new Harness();
    h.setUpToCommunication();
    render(<Root runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} care={{ status: 'not-configured' }} />);
    const link = screen.getByRole('link', { name: 'Caregiver dashboard' });
    link.focus();
    fireEvent.keyDown(link, { code: 'Space', key: ' ' });
    expect(window.location.hash).toBe('');
    expect(h.snap.message).toEqual([]);
  });

  it('the participant skip link does not leave the participant surface', () => {
    const h = new Harness();
    render(<Root runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} care={{ status: 'not-configured' }} />);
    go('#main-content');
    expect(screen.getByRole('link', { name: 'Caregiver dashboard' })).toBeTruthy();
  });

  it('switches back and forth with the header links', async () => {
    const h = new Harness();
    render(<Root runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} care={careFor(null)} />);
    go(screen.getByRole('link', { name: 'Caregiver dashboard' }).getAttribute('href')!);
    expect(await screen.findByRole('heading', { name: 'Caregiver sign-in' })).toBeTruthy();
    go(screen.getByRole('link', { name: 'Back to Motif' }).getAttribute('href')!);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Caregiver dashboard' })).toBeTruthy());
  });
});
