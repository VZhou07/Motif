import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { createLocalProfileStore } from './app/profiles';
import { Harness } from './app/session.test-support';
import type { LocalSpeech } from './app/speech';

/** Phrase groups, helper shortcuts, the paused editor and Favourites on screen (R14 C1f). */

const fakeTracker = () => ({ start: vi.fn(async () => {}), stop: vi.fn() });
const localSpeech = (h: Harness): LocalSpeech => ({ ...h.speech, refreshVoices: () => {} });
const show = (h: Harness) => render(<App runtime={{ session: h.session, speech: localSpeech(h), tracker: fakeTracker() }} />);
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const groups = (h: Harness) => h.snap.vocabulary.groups.map((group) => [group.name, ...group.phrases]);

describe('setup phrase editor', () => {
  it('adds, renames, moves, edits and removes groups and phrases, showing refusals inline', () => {
    const h = new Harness();
    show(h);
    fireEvent.change(screen.getByRole('textbox', { name: 'New group name' }), { target: { value: 'Family' } });
    fireEvent.click(button('Add group'));
    expect(groups(h).at(-1)).toEqual(['Family']);
    fireEvent.change(screen.getByRole('textbox', { name: 'New phrase for Family' }), { target: { value: 'Call my sister' } });
    fireEvent.click(button('Add to Family'));
    fireEvent.change(screen.getByRole('textbox', { name: 'New phrase for Family' }), { target: { value: 'call my sister ' } });
    fireEvent.click(button('Add to Family'));
    expect(screen.getByText('“call my sister” is already in Family.')).toBeTruthy();
    expect(groups(h).at(-1)).toEqual(['Family', 'Call my sister']);

    const rename = screen.getByRole('textbox', { name: 'Name of the Quick group' });
    fireEvent.change(rename, { target: { value: 'Answers' } });
    fireEvent.blur(rename);
    expect(groups(h)[1]![0]).toBe('Answers');
    fireEvent.click(button('Move “Thank you” up'));
    expect(groups(h)[1]).toEqual(['Answers', 'Yes', 'Thank you', 'No']);
    expect((button('Move “Yes” up') as HTMLButtonElement).disabled).toBe(true);
    const edit = screen.getByRole('textbox', { name: 'Needs phrase 1' });
    fireEvent.change(edit, { target: { value: 'I need a drink' } });
    fireEvent.blur(edit);
    expect(groups(h)[2]![1]).toBe('I need a drink');
    fireEvent.click(button('Remove “No”'));
    expect(groups(h)[1]).toEqual(['Answers', 'Yes', 'Thank you']);

    fireEvent.click(button('Remove Needs group'));
    expect(groups(h).map((group) => group[0])).toContain('Needs'); // asks first: it still has phrases
    fireEvent.click(button('Remove Needs and its 3 phrases'));
    expect(groups(h).map((group) => group[0])).toEqual(['Favourites', 'Answers', 'Family']);
    expect(screen.queryByRole('textbox', { name: 'Name of the Favourites group' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove Favourites/ })).toBeNull();
  });

  it('shows the edited groups on the communication board', () => {
    const h = new Harness();
    show(h);
    fireEvent.change(screen.getByRole('textbox', { name: 'New phrase for Favourites' }), { target: { value: 'Good morning' } });
    fireEvent.click(button('Add to Favourites'));
    fireEvent.click(button(/assisted input/i));
    expect(button('Open Favourites, 1 phrase')).toBeTruthy();
    fireEvent.click(button('Open Favourites, 1 phrase'));
    expect(screen.getByRole('heading', { name: 'Favourites · 1 phrase' })).toBeTruthy();
    fireEvent.click(button('Add “Good morning” to message'));
    expect(h.snap.message).toEqual(['Good morning']);
    expect(screen.getByRole('heading', { name: 'Main list' })).toBeTruthy();
  });
});

describe('communication levels on screen', () => {
  it('helper shortcuts (inside Helper) open any group or the main list, and are disabled while paused', () => {
    const h = new Harness();
    show(h);
    fireEvent.click(button(/assisted input/i));
    fireEvent.click(button('Helper'));
    const tabs = within(screen.getByRole('navigation', { name: 'Helper shortcuts to phrase groups' }));
    fireEvent.click(tabs.getByRole('button', { name: 'Needs' }));
    expect(h.snap.level?.group?.id).toBe('g2');
    expect(screen.getByRole('group', { name: 'Needs phrases' })).toBeTruthy();
    expect(button('Back')).toBeTruthy();
    fireEvent.click(button('Back'));
    fireEvent.click(button('Helper'));
    expect(screen.getByRole('heading', { name: 'Helper options' })).toBeTruthy();
    expect(button('Save message to Favourites')).toBeTruthy();
    fireEvent.click(button('Pause'));
    const paused = within(screen.getByRole('navigation', { name: 'Helper shortcuts to phrase groups' }));
    expect((paused.getByRole('button', { name: 'Quick' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(paused.getByRole('button', { name: 'Quick' }));
    expect(h.snap.level?.kind).toBe('more');
    fireEvent.click(button('Resume'));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Helper shortcuts to phrase groups' })).getByRole('button', { name: 'Main list' }));
    expect(h.snap.level?.kind).toBe('top');
  });

  it('confirms a favourite on screen and counts it in the automatic-save note', () => {
    const h = new Harness();
    h.setUpToCommunication();
    show(h);
    act(() => { h.click('phrase:g1:2'); h.click('save-favourite'); });
    expect(screen.getByText('Save “Thank you” to Favourites?')).toBeTruthy();
    fireEvent.click(button('Save “Thank you” to Favourites'));
    expect(h.snap.vocabulary.groups[0]!.phrases).toEqual(['Thank you']);
    // The automatic-save note (inside Helper) carries the count (R19).
    fireEvent.click(button('Helper'));
    expect(screen.getByText(/saved on this device automatically.*including 1 favourite\)/)).toBeTruthy();
  });

  it('the edit panel works only while paused, and Resume returns to the main list after a change', () => {
    const h = new Harness();
    show(h);
    fireEvent.click(button(/assisted input/i));
    fireEvent.click(button('Helper'));
    expect(screen.getByText(/Pause scanning first/)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'New phrase for Needs' })).toBeNull();
    fireEvent.click(button('Pause'));
    fireEvent.change(screen.getByRole('textbox', { name: 'New phrase for Needs' }), { target: { value: 'Turn me over' } });
    fireEvent.click(button('Add to Needs'));
    expect(groups(h)[2]).toEqual(['Needs', 'I need water', 'Please help me', 'I am uncomfortable', 'Turn me over']);
    fireEvent.click(button('Resume'));
    expect(h.snap.level?.kind).toBe('top');
    expect(h.snap.announcement).toBe('Resumed at the main list because the phrases changed.');
    expect(button('Open Needs, 4 phrases')).toBeTruthy();
  });

  it('the paused editor says changes cannot be kept when this browser blocks storage (R19)', () => {
    const h = new Harness({ profiles: createLocalProfileStore(() => null) });
    h.setUpToCommunication();
    show(h);
    act(() => { h.session.selectTarget('more'); h.session.selectTarget('pause'); });
    fireEvent.click(screen.getByText('Edit phrases'));
    expect(screen.getByText('This browser cannot keep changes; they last until this page closes.')).toBeTruthy();
    expect(screen.queryByText(/Changes are kept on this device automatically/)).toBeNull();
  });
});
