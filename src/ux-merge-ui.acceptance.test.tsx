import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { Harness } from './app/session.test-support';
import type { LocalSpeech } from './app/speech';
import type { MotifRuntime } from './app/useMotif';

// R18 merge, UI part of M9 (UX_ACCEPTANCE.md).

function mount(h: Harness) {
  return render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
    runtime: { session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: { start: vi.fn(async () => {}), stop: vi.fn() } },
  }));
}
function ready(): Harness { const h = new Harness(); h.setUpToCommunication(); expect(h.snap.stage).toBe('communication'); return h; }
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const maybe = (name: string | RegExp) => screen.queryByRole('button', { name });
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('M9 combined talking screen', () => {
  it('M9 the message bar precedes the group tiles and Speak/Undo are always on screen', () => {
    mount(ready());
    expect(before(screen.getByRole('region', { name: 'Message' }), screen.getByRole('group', { name: 'Phrase groups' }))).toBe(true);
    expect(button(/^Speak/)).toBeTruthy();
    expect(button(/^Undo/)).toBeTruthy();
  });

  it('M9 main\'s group tabs and operation toolbar are not on the main screen', () => {
    mount(ready());
    expect(screen.queryByRole('navigation', { name: /phrase groups/i })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(maybe('Main list')).toBeNull();
    for (const name of [/^Clear message/, /^Recalibrate/, /^Practice/, /^Slower scanning/, /^Save message to Favourites/, /^Change controls/]) expect(maybe(name)).toBeNull();
  });

  it('M9 three group tiles, Pause and Helper are on the main screen', () => {
    mount(ready());
    for (const name of [/^Open Quick/, /^Open Needs/, /Favourites/, /^Pause/, /^Helper$/]) expect(button(name)).toBeTruthy();
  });

  it('M9 the Helper panel shows "Your controls" first, then Scanning and message, then the click-only sections', () => {
    mount(ready());
    fireEvent.click(button('Helper'));
    const controls = screen.getByRole('group', { name: 'Your controls' });
    const scanning = screen.getByRole('group', { name: 'Scanning and message' });
    expect(before(controls, scanning)).toBe(true);
    for (const name of [/^Change controls/, /^Add a movement/, /^Recalibrate/]) expect(within(controls).getByRole('button', { name })).toBeTruthy();
    const sections = ['Jump to a phrase group', 'Edit phrases', 'Camera diagnostics', 'Setup evidence'];
    let previous: Element = scanning;
    for (const text of sections) {
      const element = screen.getAllByText(new RegExp(`^${text}`))[0]!;
      expect(before(previous, element)).toBe(true);
      previous = element;
    }
    for (const name of [/^Clear message/, /^Save message to Favourites/, /^Say it again/, /^Practice/]) expect(within(scanning).getByRole('button', { name })).toBeTruthy();
  });

  it('M9 diagnostics stay hidden until opened and the Movement seen status exists', () => {
    mount(ready());
    expect(screen.getByRole('status', { name: /Movement seen/ })).toBeTruthy();
    expect(screen.queryByLabelText('Live camera diagnostics')).toBeNull();
    fireEvent.click(button('Helper'));
    expect(screen.queryByLabelText('Live camera diagnostics')).toBeNull();
    fireEvent.click(button(/Camera diagnostics/));
    expect(screen.getByLabelText('Live camera diagnostics')).toBeTruthy();
  });

  it('M9 while paused at the Helper level the panel stays visible under a Resume banner and Edit phrases is usable', () => {
    const h = ready();
    mount(h);
    fireEvent.click(button('Helper'));
    fireEvent.click(within(screen.getByRole('group', { name: 'Scanning and message' })).getByRole('button', { name: /Pause/ }));
    expect(h.snap.scan!.paused).toBe(true);
    expect(screen.getByRole('region', { name: 'Helper options' })).toBeTruthy();
    expect(button(/Resume/)).toBeTruthy();
    const heading = screen.getByRole('heading', { name: 'Helper options' });
    expect(heading).toBeTruthy();
    const summary = screen.getAllByText(/^Edit phrases/)[0]!;
    fireEvent.click(summary);
    const field = screen.getByLabelText(/New group name/) as HTMLInputElement;
    expect(field.disabled).toBe(false);
    fireEvent.change(field, { target: { value: 'Family' } });
    fireEvent.click(button('Add group'));
    expect(h.snap.vocabulary.groups.map((group) => group.name)).toContain('Family');
    act(() => { fireEvent.click(button(/Resume/)); });
    expect(h.snap.scan!.paused).toBe(false);
    expect(h.snap.level?.kind).toBe('top');
  });

  it('M9 editing is explained, not offered, while scanning is running', () => {
    mount(ready());
    fireEvent.click(button('Helper'));
    fireEvent.click(screen.getAllByText(/^Edit phrases/)[0]!);
    expect(screen.queryByLabelText(/New group name/)).toBeNull();
    expect(document.body.textContent).toMatch(/Pause scanning first/);
  });

  it('M9 a paused main list shows the Resume card over the board', () => {
    const h = ready();
    mount(h);
    fireEvent.click(button(/^Pause/));
    expect(button(/Resume/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Helper options' })).toBeNull();
  });

  it('M9 focus: heading on open, the Helper button on close, the question on confirm', () => {
    const h = ready();
    mount(h);
    fireEvent.click(button('Helper'));
    expect(/^H[1-6]$/.test((document.activeElement as HTMLElement).tagName)).toBe(true);
    fireEvent.click(button('Close helper'));
    expect(document.activeElement).toBe(button('Helper'));
    fireEvent.click(button('Helper'));
    fireEvent.click(button(/^Recalibrate/));
    const question = document.activeElement as HTMLElement;
    expect(question.tagName).not.toBe('BODY');
    expect(question.tagName).not.toBe('BUTTON');
    expect(question.textContent).toMatch(/recalibrat/i);
  });
});
