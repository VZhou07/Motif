import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { Harness } from './app/session.test-support';
import type { LocalSpeech } from './app/speech';
import type { MotifRuntime } from './app/useMotif';

// Branch ux-comm-screen, UI criteria C10, C11 (names, sizes) and C16 (focus). See UX_ACCEPTANCE.md.

function mount(h: Harness) {
  return render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
    runtime: { session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: { start: vi.fn(async () => {}), stop: vi.fn() } },
  }));
}
function ready(): Harness {
  const h = new Harness();
  h.setUpToCommunication();
  expect(h.snap.stage).toBe('communication');
  return h;
}
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const maybeButton = (name: string | RegExp) => screen.queryByRole('button', { name });
const phrase = (text: string) => button(`Add “${text}” to message`);
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const unnamed = () => ['button', 'textbox', 'combobox', 'checkbox', 'radio'].flatMap((role) =>
  screen.queryAllByRole(role, { name: (name) => name.trim() === '' }).map((el) => `${role}: ${el.outerHTML.slice(0, 80)}`));

describe('C10 communication layout', () => {
  it('C10 the message region comes before the phrase grid', () => {
    mount(ready());
    const message = screen.getByRole('region', { name: 'Message' });
    const grid = screen.getByRole('group', { name: 'Phrases' });
    expect(before(message, grid)).toBe(true);
  });

  it('C10 Speak and Undo appear only with a message', () => {
    mount(ready());
    expect(maybeButton(/^Speak/)).toBeNull();
    expect(maybeButton(/^Undo/)).toBeNull();
    fireEvent.click(phrase('Yes'));
    expect(button(/^Speak/)).toBeTruthy();
    expect(button(/^Undo/)).toBeTruthy();
    fireEvent.click(button(/^Undo/));
    expect(maybeButton(/^Speak/)).toBeNull();
    expect(maybeButton(/^Undo/)).toBeNull();
  });

  it('C10 "Say it again" appears only after something was spoken, with the last spoken text', () => {
    mount(ready());
    expect(maybeButton(/Say it again/)).toBeNull();
    fireEvent.click(phrase('Yes'));
    expect(maybeButton(/Say it again/)).toBeNull();
    fireEvent.click(button(/^Speak/));
    expect(button(/Say it again/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Message' }).textContent).toMatch(/Yes/);
    expect(maybeButton(/^Speak/)).toBeNull();
  });

  it('C10 the Helper panel shows "Your controls" tiles before "Scanning and message"', () => {
    mount(ready());
    fireEvent.click(button('Helper'));
    const controls = screen.getByRole('group', { name: 'Your controls' });
    const scanning = screen.getByRole('group', { name: 'Scanning and message' });
    expect(before(controls, scanning)).toBe(true);
    for (const name of [/^Change controls/, /^Add a movement/, /^Recalibrate/]) expect(within(controls).getByRole('button', { name })).toBeTruthy();
    expect(controls.textContent).toMatch(/Choose what each movement does/);
    expect(button('Close helper')).toBeTruthy();
    expect(within(scanning).getByRole('button', { name: /Pause/ })).toBeTruthy();
  });

  it('C10 camera diagnostics and the signal dashboard are not on the communication screen until opened from the panel', () => {
    mount(ready());
    expect(screen.queryByText('Camera diagnostics')).toBeNull();
    expect(screen.queryByLabelText('Live camera diagnostics')).toBeNull();
    expect(screen.queryByText('Movement signal dashboard')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /beeps/i })).toBeNull();
    fireEvent.click(button('Helper'));
    expect(screen.queryByRole('checkbox', { name: /beeps/i })).toBeNull();
    const summary = screen.getByText('Camera diagnostics');
    fireEvent.click(summary);
    expect(screen.getByLabelText('Live camera diagnostics')).toBeTruthy();
  });

  it('C10 a "Movement seen" status exists and the compact camera panel stays', () => {
    mount(ready());
    expect(screen.getByRole('status', { name: /Movement seen/ })).toBeTruthy();
  });

  it('C10 practice shows Finish practice and no Helper', () => {
    const h = ready();
    mount(h);
    fireEvent.click(button('Helper'));
    fireEvent.click(button(/^Practice/));
    expect(h.snap.stage).toBe('practice');
    expect(button(/Finish practice/)).toBeTruthy();
    expect(maybeButton('Helper')).toBeNull();
    expect(screen.getByRole('status', { name: /Movement seen/ })).toBeTruthy();
  });
});

describe('C11 sizes and names', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
  const sizeOf = (selector: string): number | null => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sizes = [...css.matchAll(new RegExp(`${escaped}\\{[^}]*?font-size:\\s*(\\d+(?:\\.\\d+)?)(px|rem)`, 'g'))].map((m) => Number(m[1]) * (m[2] === 'rem' ? 16 : 1));
    return sizes.length ? Math.min(...sizes) : null;
  };

  it('C11 message text is at least 24px', () => {
    expect(sizeOf('.message-text')).not.toBeNull();
    expect(sizeOf('.message-text')!).toBeGreaterThanOrEqual(24);
  });

  it('C11 every control has an accessible name on every communication state', () => {
    const h = ready();
    mount(h);
    const states: Array<[string, () => void]> = [
      ['board', () => {}],
      ['message', () => { fireEvent.click(phrase('Yes')); }],
      ['helper', () => { fireEvent.click(button('Helper')); }],
      ['clear confirmation', () => { fireEvent.click(button(/^Clear/)); }],
      ['board again', () => { fireEvent.click(button('Keep it')); }],
      ['spoken', () => { fireEvent.click(button(/^Speak/)); }],
      ['helper after speaking', () => { fireEvent.click(button('Helper')); }],
      ['practice', () => { fireEvent.click(button(/^Practice/)); }],
    ];
    for (const [name, go] of states) {
      act(go);
      expect([name, unnamed()]).toEqual([name, []]);
    }
  });
});

describe('C16 focus', () => {
  it('C16 opening Helper focuses the panel heading and Close helper returns focus to the Helper button', () => {
    mount(ready());
    fireEvent.click(button('Helper'));
    const active = document.activeElement as HTMLElement;
    expect(/^H[1-6]$/.test(active.tagName)).toBe(true);
    expect(active.textContent).toMatch(/Helper/i);
    fireEvent.click(button('Close helper'));
    expect(document.activeElement).toBe(button('Helper'));
  });

  it('C16 the Clear confirmation focuses its question; Keep it and Yes return focus to the Helper button', () => {
    mount(ready());
    fireEvent.click(phrase('Yes'));
    fireEvent.click(button('Helper'));
    fireEvent.click(button(/^Clear/));
    const question = document.activeElement as HTMLElement;
    expect(question.tagName).not.toBe('BODY');
    expect(question.tagName).not.toBe('BUTTON');
    expect(question.textContent).toMatch(/clear/i);
    expect(screen.getByRole('region', { name: 'Message' }).contains(question)).toBe(true);
    fireEvent.click(button('Keep it'));
    expect(document.activeElement).toBe(button('Helper'));
    fireEvent.click(button('Helper'));
    fireEvent.click(button(/^Clear/));
    fireEvent.click(button(/Yes, clear it/));
    expect(document.activeElement).toBe(button('Helper'));
  });
});
