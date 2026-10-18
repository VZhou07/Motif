import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { Harness } from './app/session.test-support';
import type { LocalSpeech } from './app/speech';
import type { MotifRuntime } from './app/useMotif';

// R19 UI (F5): phrase groups and Favourites hidden by default. See UX_ACCEPTANCE.md.

const tracker = () => ({ start: vi.fn(async () => {}), stop: vi.fn() });
function mount(h: Harness) {
  return render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
    runtime: { session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: tracker() },
  }));
}
function flat(): Harness { const h = new Harness({ phraseGroups: false }); h.setUpToCommunication(); return h; }
const phraseButtons = () => screen.queryAllByRole('button', { name: /^Add “.+” to message$/ });
const BANNED = /Open Quick|Open Needs|\(empty\)|Jump to a phrase group/;

describe('F5 flat board on screen', () => {
  it('F5 the six phrase tiles show directly, numbered, in order, with no group, Favourites or empty text', () => {
    mount(flat());
    const tiles = phraseButtons();
    expect(tiles).toHaveLength(6);
    expect(tiles.map((tile) => tile.textContent!.replace(/^\d+/, '').trim())).toEqual(['Yes', 'No', 'Thank you', 'I need water', 'Please help me', 'I am uncomfortable']);
    expect(tiles.map((tile) => tile.textContent!.match(/^\d+/)?.[0])).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(document.body.textContent).not.toMatch(BANNED);
    expect(screen.queryByRole('group', { name: 'Phrase groups' })).toBeNull();
  });

  it('F5 a tile adds its phrase and Play speaks it', () => {
    const h = flat();
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Add “I need water” to message' }));
    expect(h.snap.message).toEqual(['I need water']);
    fireEvent.click(screen.getByRole('button', { name: /^Play/ }));
    expect(h.spoken).toEqual(['I need water']);
  });

  it('F5 the tile count equals the flat phrase count after edits (add, remove)', () => {
    const h = flat();
    h.selectByGesture('pause');
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'g1', text: 'Hello' }).ok).toBe(true);
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'g2', text: 'Turn me over' }).ok).toBe(true);
    h.session.resume();
    mount(h);
    expect(phraseButtons()).toHaveLength(8);
    act(() => {
      h.selectByGesture('pause');
      h.session.editVocabulary({ kind: 'remove-phrase', group: 'g2', index: 0 });
      h.session.resume();
    });
    expect(phraseButtons()).toHaveLength(7);
    expect(phraseButtons().map((tile) => tile.textContent!.replace(/^\d+/, '').trim())).not.toContain('I need water');
  });

  it('F5 a Favourites phrase stored in the profile is not shown as a tile', () => {
    const h = flat();
    h.selectByGesture('pause');
    h.session.editVocabulary({ kind: 'add-phrase', group: 'favourites', text: 'Secret favourite' });
    h.session.resume();
    mount(h);
    expect(phraseButtons()).toHaveLength(6);
    expect(document.body.textContent).not.toMatch(/Secret favourite/);
  });

  it('F5 the Helper has no group jump, Save to Favourites, Favourites editor or favourites saving copy', () => {
    const h = flat();
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Helper' }));
    expect(document.body.textContent).not.toMatch(BANNED);
    expect(screen.getByRole('button', { name: /Save message to Favourites/ })).toBeTruthy();
    const note = screen.getByText(/Your setup is saved on this device automatically/);
    expect(note.textContent).toMatch(/phrases/);
    expect(note.textContent).not.toMatch(/phrase groups/i);
    fireEvent.click(within(screen.getByRole('group', { name: 'Scanning and message' })).getByRole('button', { name: /Pause/ }));
    fireEvent.click(screen.getAllByText(/^Edit phrases/)[0]!);
    expect(screen.getByRole('textbox', { name: 'New phrase for Quick' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'New phrase for Needs' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Favourites/ })).toBeNull();
  });

  it('F5 an edit made in the Helper shows as a new tile after Resume', () => {
    const h = flat();
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Helper' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Scanning and message' })).getByRole('button', { name: /Pause/ }));
    fireEvent.click(screen.getAllByText(/^Edit phrases/)[0]!);
    fireEvent.change(screen.getByRole('textbox', { name: 'New phrase for Needs' }), { target: { value: 'Turn me over' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Needs' }));
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Resume/ })); });
    expect(phraseButtons()).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Add “Turn me over” to message' })).toBeTruthy();
  });

  it('F5 the app builds a flat session by itself when none is supplied (assisted mode)', () => {
    render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
      runtime: { speech: { available: () => false, status: () => ({ available: false, voiceName: null }), speak: () => false, cancel: () => {}, refreshVoices: () => {} } as unknown as LocalSpeech, tracker: tracker() },
    }));
    fireEvent.click(screen.getByRole('button', { name: /Use assisted input/ }));
    expect(phraseButtons()).toHaveLength(6);
    expect(document.body.textContent).not.toMatch(BANNED);
  });
});

describe('F5 grouped mode (the option on)', () => {
  it('F5 group tiles read as the group name with the count, never as the long label; the accessible name still describes it', () => {
    const h = new Harness();
    h.setUpToCommunication();
    mount(h);
    const quick = screen.getByRole('button', { name: 'Open Quick, 3 phrases' });
    expect(quick.textContent).toMatch(/Quick/);
    expect(quick.textContent).toMatch(/3 phrases/);
    expect(quick.textContent).not.toMatch(/Open |, 3 phrases/);
    const needs = screen.getByRole('button', { name: 'Open Needs, 3 phrases' });
    expect(needs.textContent).toMatch(/Needs/);
    const favourites = screen.getByRole('button', { name: /Favourites/ });
    expect(favourites.textContent).not.toMatch(/\(empty\)|Open /);
    expect(favourites.getAttribute('aria-label') ?? favourites.textContent).toMatch(/Favourites/);
  });

  it('F5 grouped mode keeps Jump to a phrase group, Save message to Favourites and the Favourites editor', () => {
    const h = new Harness();
    h.setUpToCommunication();
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Helper' }));
    expect(screen.getAllByText(/^Jump to a phrase group/)[0]).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save message to Favourites/ })).toBeTruthy();
    expect(screen.getByText(/phrase groups \(including 0 favourites\)/)).toBeTruthy();
  });
});
