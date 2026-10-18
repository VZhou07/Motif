import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { Harness } from './app/session.test-support';
import type { LocalSpeech } from './app/speech';

/** R19 on screen: flat phrase tiles by default, with the group UI hidden. */
const fakeTracker = () => ({ start: vi.fn(async () => {}), stop: vi.fn() });
const show = (h: Harness) => render(<App runtime={{ session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: fakeTracker() }} />);
const flat = () => { const h = new Harness({ phraseGroups: false }); h.setUpToCommunication(); return h; };
const tiles = () => [...document.querySelectorAll('.phrase-tile')];

describe('flat board', () => {
  it('shows the six phrases directly, numbered, with no group, Favourites or empty text', () => {
    show(flat());
    expect(tiles()).toHaveLength(6);
    expect(tiles()[0]!.textContent).toMatch(/^01/);
    const text = document.querySelector('main')!.textContent ?? '';
    expect(text).not.toMatch(/Favourites|Open Quick|Open Needs|\(empty\)|Jump to a phrase group/);
    expect(screen.getByRole('button', { name: 'Add “Yes” to message' })).toBeTruthy();
  });

  it('the tile count follows an edit', () => {
    const h = flat();
    h.selectByGesture('pause');
    expect(h.session.editVocabulary({ kind: 'add-phrase', group: 'g2', text: 'Turn me over' }).ok).toBe(true);
    h.session.resume();
    show(h);
    expect(tiles()).toHaveLength(7);
  });

  it('the Helper hides group jump, Save to Favourites, the Favourites editor and the favourites saving copy', () => {
    show(flat());
    fireEvent.click(screen.getByRole('button', { name: 'Helper' }));
    const text = document.querySelector('main')!.textContent ?? '';
    expect(text).not.toMatch(/Jump to a phrase group|Save message to Favourites|Favourites/);
    expect(screen.queryByRole('textbox', { name: 'New phrase for Favourites' })).toBeNull();
    expect(screen.getByText(/movement settings, controls, phrases, scan speed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' })); // phrases are edited while paused
    expect(screen.getByRole('textbox', { name: 'New phrase for Needs' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'New phrase for Favourites' })).toBeNull();
  });
});

describe('grouped board', () => {
  it('group tiles read as the name with the count, and keep the long accessible name', () => {
    const h = new Harness();
    h.setUpToCommunication();
    show(h);
    const quick = screen.getByRole('button', { name: 'Open Quick, 3 phrases' });
    expect(quick.textContent).toMatch(/Quick/);
    expect(quick.textContent).toMatch(/3 phrases/);
    expect(quick.textContent).not.toMatch(/Open Quick/);
    const favourites = screen.getByRole('button', { name: 'Favourites (empty)' });
    expect(favourites.textContent).not.toMatch(/\(empty\)/);
  });
});
