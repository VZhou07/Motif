import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY } from './profiles';
import { HEAD_WOBBLE, Harness, MOUTH, BROW, REST, type Values } from './session.test-support';
import type { LocalSpeech } from './speech';
import type { MotifRuntime } from './useMotif';

// UX slice 3 acceptance rows 3.1-3.7 (UX_ACCEPTANCE.md): click a movement to record; rename on the approve screen.

const BROW_LABEL = 'Raise left outer eyebrow';
const BROW_CHOICE = { feature: 'browOuterUpLeft', direction: 1, label: BROW_LABEL } as const;
const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const perform = (label: string | null): Values => (label === 'Open mouth' ? MOUTH : label === BROW_LABEL ? BROW : label ? BROW : REST);

function mount(h: Harness) {
  return render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
    runtime: { session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: { start: vi.fn(async () => {}), stop: vi.fn() } },
  }));
}
/** Camera running and the rest check done: the choose screen. */
function atChoose(h = new Harness()): Harness {
  h.session.setCamera('running');
  h.session.startBaseline();
  h.run(10_500);
  expect(h.snap.stage).toBe('choose');
  return h;
}
function toComfort(h: Harness, choice: { feature: string; direction: 1 | -1; label: string } = BROW_CHOICE): void {
  h.session.chooseMovement(choice as never);
  h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
  h.run(11_000, HEAD_WOBBLE);
  expect(h.snap.stage).toBe('comfort');
}
const tile = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });
const nameField = () => screen.getByRole('textbox', { name: /Name this movement/ }) as HTMLInputElement;
const rename = (value: string) => { fireEvent.change(nameField(), { target: { value } }); fireEvent.blur(nameField()); };
const savedLabels = (storage: ReturnType<typeof createMemoryStorage>): string[] =>
  JSON.parse(storage.data.get(PROFILE_KEY)!).profiles.flatMap((profile: { models: Array<{ label: string }> }) => profile.models.map((model) => model.label));

describe('3.1 click a tile to record', () => {
  it('3.1 clicking a movement tile starts training at once', () => {
    const h = atChoose();
    mount(h);
    fireEvent.click(tile(BROW_LABEL));
    expect(h.snap.stage).toBe('training');
    expect(h.snap.choice?.label).toBe(BROW_LABEL);
  });

  it('3.1 the choose screen has no Record button and no name field', () => {
    const h = atChoose();
    mount(h);
    expect(screen.queryByRole('button', { name: /Record this movement/ })).toBeNull();
    // Only the helper phrase-group editor's own group-name fields (C1/R18) may match; no movement-name field.
    expect(screen.queryAllByRole('textbox', { name: /name/i }).filter((field) => !field.closest('.phrase-editor'))).toEqual([]);
    expect(screen.queryByLabelText(/Name for this movement/)).toBeNull();
    expect(screen.getByRole('button', { name: /Stop setup/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Find my movements/ })).toBeTruthy();
  });
});

describe('3.2 tiles are disabled when they cannot record', () => {
  it('3.2 tiles are disabled while the camera is not running and clicking does nothing', () => {
    const h = atChoose();
    act(() => h.session.setCamera('off'));
    mount(h);
    expect(h.snap.stage).toBe('choose');
    expect((tile(BROW_LABEL) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(tile(BROW_LABEL));
    expect(h.snap.stage).toBe('choose');
  });

  it('3.2 movements already in use stay disabled while adding', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable');
    h.selectByGesture('finish-practice');
    h.selectByGesture('add-movement');
    expect(h.snap.adding).toBe(true);
    mount(h);
    const used = tile(BROW_LABEL) as HTMLButtonElement;
    expect(used.disabled).toBe(true);
    fireEvent.click(used);
    expect(h.snap.stage).toBe('choose');
    expect((tile('Open mouth') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('3.3 rename on the comfort screen', () => {
  it('3.3 shows a labelled name field prefilled with the default label', () => {
    const h = new Harness();
    atChoose(h);
    toComfort(h);
    mount(h);
    expect(nameField().value).toBe(BROW_LABEL);
  });

  it('3.3 typing a name and approving at once (no blur) keeps it in every copy, with id and thresholds unchanged', () => {
    const storage = createMemoryStorage();
    const h = new Harness({ profiles: createLocalProfileStore(() => storage) });
    atChoose(h);
    toComfort(h);
    const before = h.snap.candidate!;
    mount(h);
    fireEvent.change(nameField(), { target: { value: 'Left brow lift' } });
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.approvedModels).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and practice' }));
    expect(h.snap.stage).toBe('practice');
    const [model] = h.snap.approvedModels;
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(model!.label).toBe('Left brow lift');
    expect({ ...model!, label: before.label }).toEqual(before);
    expect(h.snap.mappingLabel).toMatch(/Left brow lift/);
    expect(h.snap.mappingLabel).not.toMatch(/Raise left outer eyebrow/);
    expect(h.snap.diagnosticModel?.label).toBe('Left brow lift');
    expect(h.snap.cycles.at(-1)!.movement).toBe('Left brow lift');
    expect(savedLabels(storage)).toEqual(['Left brow lift']);
    expect(h.snap.evidence.map((item) => item.label)).toContain('Left brow lift');
  });

  it('3.3 the name field also applies on Enter and updates the preview', () => {
    const h = atChoose();
    toComfort(h);
    mount(h);
    fireEvent.change(nameField(), { target: { value: 'My blink' } });
    fireEvent.keyDown(nameField(), { key: 'Enter', code: 'Enter' });
    expect(h.snap.comfortPreview?.label).toMatch(/My blink/);
  });
});

describe('3.3 typing keeps the same input', () => {
  it('3.3 several keystrokes keep the same input element, its focus and its value while the session publishes', () => {
    const h = atChoose();
    toComfort(h);
    mount(h);
    const input = nameField();
    input.focus();
    expect(document.activeElement).toBe(input);
    let published = 0;
    const unsubscribe = h.session.subscribe(() => { published += 1; });
    for (const value of ['M', 'My', 'My ', 'My b', 'My brow']) {
      fireEvent.change(input, { target: { value } });
      expect(nameField()).toBe(input);
      expect(input.isConnected).toBe(true);
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe(value);
    }
    unsubscribe();
    expect(published).toBeGreaterThan(0);
    expect(h.snap.candidate?.label).toBe('My brow');
  });
});

describe('3.4 rename refusals', () => {
  it('3.4 blank and over-60-character (after trimming) names are refused, trimmed names accepted, last valid name kept', () => {
    const h = atChoose();
    toComfort(h);
    expect(h.session.renameMovement('Good')).toEqual({ ok: true });
    for (const bad of ['', '   ', 'x'.repeat(61), `  ${'x'.repeat(61)}  `]) {
      const result = h.session.renameMovement(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.length).toBeGreaterThan(5);
      expect(h.snap.candidate?.label).toBe('Good');
      expect(h.snap.cycles.at(-1)!.movement).toBe('Good');
    }
    expect(h.session.renameMovement(`  ${'x'.repeat(60)}  `)).toEqual({ ok: true });
    expect(h.snap.candidate?.label).toBe('x'.repeat(60));
    expect(h.session.renameMovement('  Trimmed  ')).toEqual({ ok: true });
    expect(h.snap.candidate?.label).toBe('Trimmed');
    expect(h.snap.diagnosticModel?.label).toBe('Trimmed');
    expect(h.snap.choice?.label).toBe('Trimmed');
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.approvedModels).toHaveLength(0);
  });

  it('3.4 a duplicate of an approved movement label is refused while adding', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable');
    h.selectByGesture('finish-practice');
    h.addMovement(OPEN_MOUTH, perform);
    expect(h.snap.stage).toBe('comfort');
    const result = h.session.renameMovement(BROW_LABEL);
    expect(result.ok).toBe(false);
    expect(h.session.renameMovement(` ${BROW_LABEL} `).ok).toBe(false);
    expect(h.snap.candidate?.label).toBe('Open mouth');
    expect(h.session.renameMovement('Wide mouth')).toEqual({ ok: true });
    expect(h.snap.candidate?.label).toBe('Wide mouth');
  });

  it('3.4 the screen shows the refusal in a status line and keeps the default name', () => {
    const h = atChoose();
    toComfort(h);
    mount(h);
    fireEvent.change(nameField(), { target: { value: 'Good' } });
    rename('   ');
    expect(h.snap.candidate?.label).toBe('Good');
    expect(screen.getAllByRole('status').some((el) => /name/i.test(el.textContent ?? '') && !/Verified/.test(el.textContent ?? ''))).toBe(true);
    expect(h.snap.approvedModels).toHaveLength(0);
  });

  it('3.4 renaming is refused outside the comfort stage and never approves', () => {
    const h = atChoose();
    expect(h.session.renameMovement('Early').ok).toBe(false);
    h.session.chooseMovement(BROW_CHOICE);
    expect(h.snap.stage).toBe('training');
    expect(h.session.renameMovement('Early').ok).toBe(false);
    h.followPrompts((snap) => snap.stage === 'negative', (snap) => perform(snap.capture?.movement ?? null));
    expect(h.session.renameMovement('Early').ok).toBe(false);
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.candidate?.label).toBe(BROW_LABEL);
    h.session.decide('approve-comfortable');
    expect(h.snap.stage).toBe('practice');
    expect(h.session.renameMovement('Late').ok).toBe(false);
    expect(h.snap.approvedModels.map((model) => model.label)).toEqual([BROW_LABEL]);
  });

  it('3.4 a rename never approves anything', () => {
    const h = atChoose();
    toComfort(h);
    expect(h.session.renameMovement('Just a name')).toEqual({ ok: true });
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.approvedModels).toHaveLength(0);
    expect(h.snap.mapping).toBeNull();
    expect(h.snap.pendingMapping).toBeNull();
  });

  it('3.4 renaming is refused while re-checking a restored setup', () => {
    const storage = createMemoryStorage();
    const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
    first.calibrate();
    first.selectByGesture('approve-comfortable');
    first.selectByGesture('finish-practice');
    const h = new Harness({ profiles: createLocalProfileStore(() => storage) });
    h.session.setCamera('running');
    h.session.restoreProfile('Last setup', false);
    h.run(10_500);
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.restoring).toBe('Last setup');
    expect(h.snap.stage).toBe('comfort');
    expect(h.session.renameMovement('Sneaky').ok).toBe(false);
    expect(h.snap.approvedModels).toHaveLength(0);
  });
});

describe('3.5 Record again keeps the name', () => {
  it('3.5 the renamed movement is recorded again under the same name and approves with it', () => {
    const h = atChoose();
    toComfort(h);
    expect(h.session.renameMovement('My lift')).toEqual({ ok: true });
    h.session.decide('record-again');
    expect(h.snap.stage).not.toBe('comfort');
    expect(h.snap.choice?.label).toBe('My lift');
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.candidate?.label).toBe('My lift');
    h.session.decide('approve-comfortable');
    expect(h.snap.approvedModels.map((model) => model.label)).toEqual(['My lift']);
  });
});

describe('3.6 selection count', () => {
  it('3.6 Get started, pick a movement and Approve are 3 session actions to reach practice', () => {
    const h = new Harness();
    const decide = vi.spyOn(h.session, 'decide');
    const startBaseline = vi.spyOn(h.session, 'startBaseline');
    const choose = vi.spyOn(h.session, 'chooseMovement');
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    mount(h);
    fireEvent.click(tile(BROW_LABEL));
    h.followPrompts((snap) => snap.stage === 'negative', BROW);
    act(() => h.run(11_000, HEAD_WOBBLE));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and practice' }));
    expect(h.snap.stage).toBe('practice');
    expect(choose.mock.calls).toHaveLength(1);
    expect(decide.mock.calls.map((call) => call[0])).toEqual(['approve-comfortable']);
    expect(startBaseline.mock.calls.length + choose.mock.calls.length + decide.mock.calls.length).toBe(3);
  });
});

describe('3.7 other record paths unchanged', () => {
  it('3.7 choosing a noticed movement from discovery still starts training', () => {
    const h = atChoose();
    h.session.startDiscovery();
    const start = h.now;
    h.run(20_500, (now) => ((now - start - 500) % 4_000 >= 0 && (now - start - 500) % 4_000 < 1_000 ? MOUTH : REST));
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Open mouth' }));
    expect(h.snap.stage).toBe('training');
    expect(h.snap.choice?.feature).toBe('jawOpen');
  });

  it('3.7 adding a second movement still starts training from a tile and approves through mapping', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable');
    h.selectByGesture('finish-practice');
    h.selectByGesture('add-movement');
    mount(h);
    fireEvent.click(tile('Open mouth'));
    expect(h.snap.stage).toBe('training');
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    act(() => h.run(11_000, HEAD_WOBBLE));
    expect(h.snap.stage).toBe('comfort');
    expect(h.snap.decisions.map((decision) => decision.id)).toContain('approve-comfortable');
    h.selectByGesture('choose-different'); // the cards stay available after slice B
    h.selectByGesture('map:0');
    h.selectByGesture('approve-mapping');
    expect(h.snap.approvedModels).toHaveLength(2);
  });

  it('3.7 a second movement has no rename field (names are for the first movement)', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable');
    h.selectByGesture('finish-practice');
    h.addMovement(OPEN_MOUTH, perform);
    mount(h);
    expect(h.snap.stage).toBe('comfort');
    expect(screen.queryByRole('textbox', { name: /Name this movement/ })).toBeNull();
  });
});
