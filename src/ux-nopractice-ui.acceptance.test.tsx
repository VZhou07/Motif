import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { BROW, HEAD_WOBBLE, Harness, MOUTH, REST, type Values } from './app/session.test-support';
import type { LocalSpeech } from './app/speech';
import type { MotifRuntime } from './app/useMotif';

// R20 UI: Play label (P7) and no visible "practice" text (P3, P9). See UX_ACCEPTANCE.md.

const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const perform = (label: string | null): Values => (label === 'Open mouth' ? MOUTH : label ? BROW : REST);

function mount(h: Harness) {
  return render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
    runtime: { session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: { start: vi.fn(async () => {}), stop: vi.fn() } },
  }));
}
const camera = () => { const h = new Harness(); h.session.setCamera('running'); return h; };
function atChoose(): Harness { const h = camera(); h.session.startBaseline(); h.run(10_500); return h; }
function atTraining(): Harness { const h = atChoose(); h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'Raise left outer eyebrow' }); h.run(1_000); return h; }
function until(h: Harness, stage: string): Harness {
  h.followPrompts((snap) => snap.stage === stage || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
  expect(h.snap.stage).toBe(stage);
  return h;
}
function atComfort(): Harness { const h = until(atTraining(), 'negative'); h.run(11_000, HEAD_WOBBLE); expect(h.snap.stage).toBe('comfort'); return h; }
function ready(): Harness { const h = new Harness(); h.setUpToCommunication(); return h; }
function addingComfort(): Harness { const h = ready(); h.addMovement(OPEN_MOUTH, perform); return h; }
function mappingCards(): Harness { const h = addingComfort(); h.session.decide('choose-different'); expect(h.snap.stage).toBe('mapping'); return h; }
function confirm(): Harness { const h = mappingCards(); h.session.chooseSetupTarget('map:0'); expect(h.snap.stage).toBe('mapping-confirm'); return h; }

/** Everything a person can read or hear: text, names and titles in the page, plus the live announcement. */
function visible(h: Harness): string {
  const attributes = [...document.querySelectorAll('[aria-label],[title],[placeholder],[alt]')]
    .map((el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''} ${el.getAttribute('placeholder') ?? ''}`).join(' ');
  return `${document.body.textContent ?? ''} ${attributes} ${h.snap.announcement}`;
}
/** The two evidence lines about recorded attempts (scoring.ts) are the one place the word survives. */
const RECORDING_WORDING = /Weakest practice attempt|Practice strength/;
const practiceMentions = (text: string) => (text.match(/[^.|:;]*practice[^.|;]*/gi) ?? []).map((part) => part.trim());

describe('P7 Play on screen', () => {
  it('P7 the bar shows a Play button and no Speak button', () => {
    const h = ready();
    mount(h);
    expect(screen.getByRole('button', { name: /^Play/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Speak/ })).toBeNull();
  });

  it('P7 Play behaves as Speak did: the phrase is spoken and moves to Last spoken', () => {
    const h = new Harness({ phraseGroups: false });
    h.setUpToCommunication();
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Add “Yes” to message' }));
    fireEvent.click(screen.getByRole('button', { name: /^Play/ }));
    expect(h.spoken).toEqual(['Yes']);
    expect(document.querySelector('main')!.textContent).toMatch(/Last spoken/);
    expect(screen.getByRole('button', { name: /Say it again/ })).toBeTruthy();
  });

  it('P7 the Helper has no button or hint that says Speak', () => {
    const h = ready();
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Helper' }));
    expect(document.querySelector('main')!.textContent).not.toMatch(/\bSpeak\b(?! setup prompts)/);
  });

  it('P7 the "Speak setup prompts aloud" setting keeps its name on the start screen', () => {
    const h = new Harness();
    mount(h);
    fireEvent.click(screen.getByText(/Helper settings/));
    expect(screen.getByLabelText(/Speak setup prompts aloud/)).toBeTruthy();
  });

  it('P7 the first-setup approve button reads "Approve and start"', () => {
    mount(atComfort());
    expect(screen.getByRole('button', { name: 'Approve and start' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Approve and practice/ })).toBeNull();
  });
});

describe('P3 / P9 no practice text on screen', () => {
  const screens: Array<[string, () => Harness]> = [
    ['start', () => new Harness()], ['choose', () => atChoose()], ['training', () => atTraining()],
    ['verify', () => until(atTraining(), 'verify')], ['negative', () => until(atTraining(), 'negative')], ['comfort', () => atComfort()],
    ['adding comfort', () => addingComfort()], ['mapping cards', () => mappingCards()], ['mapping confirm', () => confirm()],
    ['board', () => ready()], ['flat board', () => { const h = new Harness({ phraseGroups: false }); h.setUpToCommunication(); return h; }],
    ['assisted board', () => { const h = new Harness(); h.session.useAssisted(); return h; }],
  ];
  for (const [name, make] of screens) {
    it(`P9 ${name}: no visible practice wording`, () => {
      const h = make();
      mount(h);
      const found = practiceMentions(visible(h)).filter((part) => !RECORDING_WORDING.test(part) && !/practice (strength|attempt)/i.test(part));
      expect([name, found]).toEqual([name, []]);
    });
  }

  it('P9 the board after approval shows no banner, no Start talking step, and Play is there', () => {
    const h = ready();
    mount(h);
    expect(document.querySelector('main')!.textContent).not.toMatch(/practice|nothing is spoken/i);
    expect(screen.queryByRole('button', { name: /Start talking|Finish practice/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Play/ })).toBeTruthy();
  });

  it('P9 the Helper, with evidence and editing opened, mentions practice only in the recorded-attempt evidence lines', () => {
    const h = ready();
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Helper' }));
    for (const summary of document.querySelectorAll('summary')) act(() => { (summary.parentElement as HTMLDetailsElement).open = true; });
    const found = practiceMentions(visible(h));
    expect(found.every((part) => RECORDING_WORDING.test(part))).toBe(true);
    expect(screen.queryByRole('button', { name: /^Practice/ })).toBeNull();
  });

  it('P9 refusals and announcements along setup and approval never say practice', () => {
    const h = new Harness();
    h.calibrate();
    const heard: string[] = [h.snap.announcement];
    h.session.decide('record-again');
    heard.push(h.snap.announcement);
    h.session.cancel();
    heard.push(h.snap.announcement);
    const g = addingComfort();
    heard.push(g.snap.announcement);
    g.session.decide('approve-comfortable');
    heard.push(g.snap.announcement);
    g.session.decide('approve-comfortable'); // a repeated approval is refused quietly
    heard.push(g.snap.announcement);
    expect(heard.join(' | ')).not.toMatch(/practice/i);
  });
});
