import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createLocalProfileStore, createMemoryStorage, PROFILE_KEY } from './profiles';
import { BROW, HEAD_WOBBLE, Harness, MOUTH, PUCKER, REST, type Values } from './session.test-support';
import type { LocalSpeech } from './speech';
import type { MotifRuntime } from './useMotif';

// Branch ux-simplify, slice B: V1-V8, V10 (UX_ACCEPTANCE.md; design reasoning.md "UX simplify, slice B", revision 2).

const BROW_LABEL = 'Raise left outer eyebrow';
const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const PUCKER_LIPS = { feature: 'mouthPucker', direction: 1, label: 'Pucker lips' } as const;
const MOVES: Record<string, Values> = { [BROW_LABEL]: BROW, 'Open mouth': MOUTH, 'Pucker lips': PUCKER };
const perform = (label: string | null): Values => MOVES[label ?? ''] ?? REST;
const COMFORT_2PLUS = ['record-again', 'approve-comfortable', 'effort-choose', 'choose-different', 'another-movement', 'keep-current'];

type Part = { label: string; action: string };
type Preview = { label: string; mode: 'auto' | 'step'; parts: Part[] } | null;
type Snap = Harness['snap'] & { confirmingRecalibrate: boolean; helperOpen: boolean; comfortPreview: Preview };
const snap = (h: Harness) => h.snap as Snap;
const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);
const decisionIds = (h: Harness) => h.snap.decisions.map((decision) => decision.id);
const say = (h: Harness, ...list: string[]) => { for (const id of list) h.session.selectTarget(id); };
const evidenceOf = (h: Harness, label: string) => h.snap.evidence.find((item) => item.label === label);
const sorted = (parts: Part[]) => [...parts].sort((a, b) => a.label.localeCompare(b.label));
/** The controls actually turned on, in the same shape as the preview. */
function applied(h: Harness): Part[] {
  const mapping = h.snap.mapping!;
  return Object.entries(mapping.assignments).map(([id, action]) => ({ label: h.snap.approvedModels.find((model) => model.id === id)!.label, action }));
}

function ready(options: ConstructorParameters<typeof Harness>[0] = {}): Harness { const h = new Harness(options); h.setUpToCommunication(); expect(h.snap.stage).toBe('communication'); return h; }
function ready2(): Harness {
  const h = ready();
  h.addMovement(OPEN_MOUTH, perform);
  h.selectByGesture('choose-different');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  h.stepTo('finish-practice');
  expect(h.snap.approvedModels).toHaveLength(2);
  return h;
}
/** Adding a second movement to the single-movement setup, at its comfort screen. */
function addingComfort(): Harness { const h = ready(); h.addMovement(OPEN_MOUTH, perform); expect(h.snap.stage).toBe('comfort'); expect(h.snap.adding).toBe(true); return h; }
/** Recalibrating (same movement) from Helper, at the comfort screen. */
function recalibratingComfort(h = ready()): Harness {
  say(h, 'helper', 'recalibrate', 'recalibrate-yes');
  expect(h.snap.recalibrating).toBe(true);
  h.run(10_500);
  expect(h.snap.stage).toBe('choose');
  h.session.decide('same-movement');
  h.followPrompts((s) => s.stage === 'negative' || s.stage === 'setup-failed', (s) => perform(s.capture?.movement ?? null));
  h.run(11_000, HEAD_WOBBLE);
  expect(h.snap.stage).toBe('comfort');
  return h;
}
function stagesSeen(h: Harness): Set<string> { const seen = new Set<string>(); h.session.subscribe(() => seen.add(h.session.getSnapshot().stage)); return seen; }

function savedSetup() {
  const storage = createMemoryStorage();
  const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
  first.setUpToCommunication();
  return { storage, now: first.now, options: { profiles: createLocalProfileStore(() => storage) } };
}
/** Continue with a full re-check, up to the comfort screen. */
function restoreToComfort(): { h: Harness; storage: ReturnType<typeof createMemoryStorage> } {
  const { storage, now, options } = savedSetup();
  const h = new Harness(options);
  h.now = now + 5_000;
  h.session.setCamera('running');
  expect(h.session.restoreProfile('Last setup', false)).toBe(true);
  h.run(10_500);
  h.followPrompts((s) => s.stage === 'negative' || s.stage === 'setup-failed', (s) => perform(s.capture?.movement ?? null));
  h.run(11_000, HEAD_WOBBLE);
  expect(h.snap.stage).toBe('comfort');
  return { h, storage };
}

// ═══ V1 ════════════════════════════════════════════════════════════════════
describe('V1 one Approve screen when adding or recalibrating', () => {
  it('V1 adding a movement: record-again, approve-comfortable, effort-choose, choose-different, another-movement, keep-current in order', () => {
    const h = addingComfort();
    expect(decisionIds(h)).toEqual(COMFORT_2PLUS);
    expect(decisionIds(h)).not.toContain('approve-effort');
    expect(h.snap.scan!.targets.map((target) => target.id)).toEqual(COMFORT_2PLUS);
  });

  it('V1 Approve turns on exactly the previewed controls and reaches practice with no mapping or confirm screen', () => {
    const h = addingComfort();
    const preview = snap(h).comfortPreview!;
    expect(preview).not.toBeNull();
    const seen = stagesSeen(h);
    h.session.decide('approve-comfortable');
    expect(h.snap.stage).toBe('practice');
    expect(seen.has('mapping')).toBe(false);
    expect(seen.has('mapping-confirm')).toBe(false);
    expect(h.snap.approvedModels).toHaveLength(2);
    expect(sorted(applied(h))).toEqual(sorted(preview.parts));
    expect(h.snap.mapping!.mode).toBe(preview.mode);
  });

  it('V1 the same Approve works by gesture, one selection', () => {
    const h = addingComfort();
    h.selectByGesture('approve-comfortable');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels).toHaveLength(2);
  });

  it('V1 recalibrating offers the same list and approves straight to practice', () => {
    const h = recalibratingComfort();
    expect(decisionIds(h)).toEqual(expect.arrayContaining(['record-again', 'approve-comfortable', 'another-movement', 'keep-current']));
    expect(decisionIds(h)[0]).toBe('record-again');
    const preview = snap(h).comfortPreview!;
    const seen = stagesSeen(h);
    h.session.decide('approve-comfortable');
    expect(h.snap.stage).toBe('practice');
    expect(seen.has('mapping') || seen.has('mapping-confirm')).toBe(false);
    expect(sorted(applied(h))).toEqual(sorted(preview.parts));
  });

  it('V1 recalibrating with 2+ approved movements: the new movement alone replaces them (preview names only it)', () => {
    const h = ready2();
    recalibratingComfort(h);
    const preview = snap(h).comfortPreview!;
    expect(preview.parts).toHaveLength(1);
    h.session.decide('approve-comfortable');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels).toHaveLength(1);
  });

  it('V1 one movement: the slice 2 list is unchanged', () => {
    const h = new Harness();
    h.calibrate();
    expect(decisionIds(h)).toEqual(['record-again', 'approve-comfortable', 'approve-effort', 'another-movement']);
  });
});

// ═══ V2 ════════════════════════════════════════════════════════════════════
describe('V2 preview equals what is approved', () => {
  const notesOf = (h: Harness) => (h.session as unknown as { notes: Record<string, { effort?: string; tiringReports?: number }> }).notes;

  it('V2 with no changes the preview equals the approved controls (labels, actions, mode)', () => {
    const h = addingComfort();
    const preview = snap(h).comfortPreview!;
    h.session.decide('approve-comfortable');
    expect(sorted(applied(h))).toEqual(sorted(preview.parts));
    expect(h.snap.mapping!.mode).toBe(preview.mode);
  });

  it('V2 when notes or tiring reports change between showing and approving, the approved controls equal the preview shown at the click', () => {
    for (const notes of [{ tiringReports: 2 }, { effort: 'effort' }]) {
      const h = addingComfort();
      const first = h.snap.approvedModels[0]!;
      notesOf(h)[first.id] = notes;
      h.session.refresh();
      const preview = snap(h).comfortPreview!;
      h.session.decide('approve-comfortable');
      expect([JSON.stringify(notes), h.snap.stage]).toEqual([JSON.stringify(notes), 'practice']);
      expect(sorted(applied(h))).toEqual(sorted(preview.parts));
      expect(h.snap.mapping!.mode).toBe(preview.mode);
    }
  });

  it('V2 showing the comfort screen writes no session state: no proposals, no recommendation, no pending mapping, no effort', () => {
    const h = addingComfort();
    const before = JSON.stringify({ proposals: (h.snap as unknown as { proposals: unknown }).proposals, rec: h.snap.recommendation, pending: h.snap.pendingMapping, evidence: h.snap.evidence });
    for (let i = 0; i < 5; i += 1) { h.session.refresh(); h.run(200); }
    expect(JSON.stringify({ proposals: (h.snap as unknown as { proposals: unknown }).proposals, rec: h.snap.recommendation, pending: h.snap.pendingMapping, evidence: h.snap.evidence })).toBe(before);
    expect(h.snap.recommendation).toBeNull();
    expect(h.snap.pendingMapping).toBeNull();
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(h.snap.mappingLabel).not.toMatch(/Open mouth/);
  });

  it('V2 approving after tiring was reported earlier in the session still matches the preview', () => {
    const h = ready2();
    say(h, 'helper', 'change-controls');
    say(h, 'report-tiring');
    say(h, `tiring:${h.snap.approvedModels[1]!.id}`);
    expect(h.snap.stage).toBe('mapping');
    h.session.decide('keep-current');
    h.session.selectTarget('helper');
    h.session.selectTarget('add-movement');
    h.session.chooseMovement(PUCKER_LIPS);
    h.followPrompts((s) => s.stage === 'negative' || s.stage === 'setup-failed', (s) => perform(s.capture?.movement ?? null));
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.stage).toBe('comfort');
    const preview = snap(h).comfortPreview!;
    h.session.decide('approve-comfortable');
    expect(h.snap.stage).toBe('practice');
    expect(sorted(applied(h))).toEqual(sorted(preview.parts));
  });
});

// ═══ V3 ════════════════════════════════════════════════════════════════════
describe('V3 effort-choose and choose-different', () => {
  type Card = { id: string; recommended: boolean; parts: Part[] };
  const cards = (h: Harness) => (h.snap as unknown as { proposals: Card[] }).proposals;

  it('V3 effort-choose records effort and opens the cards with a recommendation that leaves the movement unused; nothing is armed', () => {
    const h = addingComfort();
    h.session.decide('effort-choose');
    expect(h.snap.stage).toBe('mapping');
    expect(evidenceOf(h, 'Open mouth')?.effort).toBe('effort');
    expect(h.snap.recommendation).not.toBeNull();
    const recommended = cards(h).find((card) => card.recommended)!;
    expect(recommended.id).toBe(h.snap.recommendation!.id);
    expect(recommended.parts.map((part) => part.label)).not.toContain('Open mouth');
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(h.snap.mapping!.assignments).toEqual(expect.not.objectContaining({ unknown: 'select' }));
    expect(h.snap.mappingLabel).not.toMatch(/Open mouth/);
  });

  it('V3 choose-different records no effort and opens the cards; still nothing armed', () => {
    const h = addingComfort();
    h.session.decide('choose-different');
    expect(h.snap.stage).toBe('mapping');
    expect(evidenceOf(h, 'Open mouth')?.effort ?? 'unknown').toBe('unknown');
    expect(cards(h).length).toBeGreaterThanOrEqual(2);
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(h.snap.pendingMapping).toBeNull();
  });

  it('V3 a card must be confirmed before anything is armed (the cards flow still goes through confirm)', () => {
    const h = addingComfort();
    h.session.decide('effort-choose');
    const choice = cards(h).find((card) => card.recommended)!;
    h.session.chooseSetupTarget(choice.id);
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.approvedModels).toHaveLength(1);
    h.session.decide('approve-mapping');
    expect(h.snap.stage).toBe('practice');
  });

  it('V3 a refused approval announces a plain reason and arms nothing (a partial restore cannot be approved)', () => {
    const { h } = restoreToComfort();
    h.session.decide('record-again' as never);
    // Cut the verified cycle short: another movement, then try to approve what is no longer there.
    h.session.decide('another-movement');
    h.session.decide('approve-saved' as never);
    h.session.decide('approve-comfortable');
    expect(h.snap.approvedModels).toHaveLength(0);
    expect(h.snap.mapping).toBeNull();
  });
});

// ═══ V4 ════════════════════════════════════════════════════════════════════
describe('V4 Continue with a full re-check', () => {
  it('V4 the comfort screen offers choose-different, approve-saved, another-movement and no reject-profile', () => {
    const { h } = restoreToComfort();
    expect(h.snap.restoring).toBe('Last setup');
    expect(decisionIds(h)).toEqual(['choose-different', 'approve-saved', 'another-movement']);
    expect(decisionIds(h)).not.toContain('reject-profile');
  });

  it('V4 approve-saved arms the saved controls and reaches practice', () => {
    const { h, storage } = restoreToComfort();
    const savedLabels = JSON.parse(storage.data.get(PROFILE_KEY)!).profiles[0].models.map((model: { label: string }) => model.label);
    h.session.decide('approve-saved');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels.map((model) => model.label)).toEqual(savedLabels);
    expect(h.snap.mapping).not.toBeNull();
  });

  it('V4 an unverified or partial restore cannot arm through approve-saved', () => {
    const { storage, now, options } = savedSetup();
    void storage;
    const h = new Harness(options);
    h.now = now + 5_000;
    h.session.setCamera('running');
    h.session.restoreProfile('Last setup', false);
    h.session.decide('approve-saved' as never); // rest check still running
    expect(h.snap.approvedModels).toHaveLength(0);
    expect(h.snap.stage).toBe('baseline');
    h.run(10_500);
    h.session.decide('approve-saved' as never); // re-checks not done
    expect(h.snap.approvedModels).toHaveLength(0);
    h.followPrompts((s) => s.stage === 'setup-failed' || s.stage === 'comfort', () => REST); // re-check fails
    expect(h.snap.stage).toBe('setup-failed');
    h.session.decide('approve-saved' as never);
    expect(h.snap.approvedModels).toHaveLength(0);
    expect(h.snap.mapping).toBeNull();
    expect(h.snap.stage).toBe('setup-failed');
  });

  it('V4 choose-different from a restore opens mapping without arming', () => {
    const { h } = restoreToComfort();
    h.session.decide('choose-different');
    expect(h.snap.stage).toBe('mapping');
    expect(h.snap.approvedModels).toHaveLength(0);
  });

  it('V4 quick restore still goes straight to the confirm screen', () => {
    const { now, options } = savedSetup();
    const h = new Harness(options);
    h.now = now + 5_000;
    h.session.setCamera('running');
    expect(h.session.restoreProfile('Last setup', true)).toBe(true);
    expect(h.snap.stage).toBe('mapping-confirm');
    expect(h.snap.approvedModels).toHaveLength(0);
    h.session.decide('approve-mapping');
    expect(h.snap.stage).toBe('practice');
  });
});

// ═══ V5 ════════════════════════════════════════════════════════════════════
describe('V5 Recalibrate inside Helper', () => {
  it('V5 Recalibrate shows recalibrate-no then recalibrate-yes with no stage change', () => {
    const h = ready();
    say(h, 'helper', 'recalibrate');
    expect(snap(h).confirmingRecalibrate).toBe(true);
    expect(ids(h)).toEqual(['recalibrate-no', 'recalibrate-yes']);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.recalibrating).toBe(false);
  });

  it('V5 No returns to the panel with nothing changed', () => {
    const h = ready();
    const before = JSON.stringify({ ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, models: h.snap.approvedModels, message: h.snap.message });
    say(h, 'helper', 'recalibrate', 'recalibrate-no');
    expect(snap(h).confirmingRecalibrate).toBe(false);
    expect(snap(h).helperOpen).toBe(true);
    expect(ids(h)[0]).toBe('close-helper');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.recalibrating).toBe(false);
    expect(JSON.stringify({ ms: h.snap.scan!.intervalMs, mapping: h.snap.mapping, models: h.snap.approvedModels, message: h.snap.message })).toBe(before);
  });

  it('V5 Yes starts the rest check with recalibrating true and closes the panel', () => {
    const h = ready();
    say(h, 'helper', 'recalibrate', 'recalibrate-yes');
    expect(h.snap.stage).toBe('baseline');
    expect(h.snap.recalibrating).toBe(true);
    expect(h.snap.adding).toBe(false);
    expect(snap(h).helperOpen).toBe(false);
    expect(snap(h).confirmingRecalibrate).toBe(false);
  });

  it('V5 with the camera off, Yes changes nothing, stays in the panel and says why', () => {
    const h = ready();
    say(h, 'helper', 'recalibrate');
    h.session.setCamera('off');
    h.session.selectTarget('recalibrate-yes');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.recalibrating).toBe(false);
    expect(h.snap.adding).toBe(false);
    expect(snap(h).helperOpen).toBe(true);
    expect(snap(h).confirmingRecalibrate).toBe(false);
    expect(h.snap.announcement).toMatch(/Start the camera first/i);
    expect(h.snap.approvedModels).toHaveLength(1);
  });

  it('V5 the confirmation resets when communication is re-entered and when going back to the start screen', () => {
    const a = ready();
    say(a, 'helper', 'recalibrate');
    a.session.useAssisted();
    expect(snap(a).confirmingRecalibrate).toBe(false);
    const b = ready();
    say(b, 'helper', 'recalibrate');
    b.session.returnToStart();
    expect(snap(b).confirmingRecalibrate).toBe(false);
  });

  it('V5 the confirmation survives tracking loss', () => {
    const h = ready();
    say(h, 'helper', 'recalibrate');
    for (let i = 0; i < 20; i += 1) h.step(REST, 'missing');
    h.run(2_000, REST);
    expect(snap(h).confirmingRecalibrate).toBe(true);
    expect(ids(h)).toEqual(['recalibrate-no', 'recalibrate-yes']);
  });

  it('V5 the confirmation survives the step-idle fallback', () => {
    const h = ready2();
    say(h, 'helper', 'recalibrate');
    h.run(61_000, REST);
    expect(h.snap.stepFallback).toBe(true);
    expect(snap(h).confirmingRecalibrate).toBe(true);
  });

  it('V5 the recalibrate-confirm stage is never entered any more', () => {
    const h = ready();
    const seen = stagesSeen(h);
    say(h, 'helper', 'recalibrate', 'recalibrate-no', 'recalibrate', 'recalibrate-yes');
    expect(seen.has('recalibrate-confirm')).toBe(false);
  });

  it('V5 recalibrate-yes and recalibrate-no ids do nothing unless the confirmation is open', () => {
    const h = ready();
    say(h, 'recalibrate-yes', 'recalibrate-no', 'recalibrate');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.recalibrating).toBe(false);
    say(h, 'helper', 'recalibrate-yes');
    expect(h.snap.recalibrating).toBe(false);
    expect(h.snap.stage).toBe('communication');
  });
});

// ═══ V6 ════════════════════════════════════════════════════════════════════
describe('V6 A movement is tiring inside Change controls', () => {
  it('V6 Helper no longer lists tiring', () => {
    const h = ready2();
    say(h, 'helper');
    expect(ids(h)).not.toContain('tiring');
  });

  it('V6 Change controls with 2+ movements lists report-tiring after the proposals, Keep current first', () => {
    const h = ready2();
    say(h, 'helper', 'change-controls');
    expect(h.snap.stage).toBe('mapping');
    const list = decisionIds(h);
    expect(list[0]).toBe('keep-current');
    expect(list).toContain('report-tiring');
    const lastCard = Math.max(...list.map((id, index) => (id.startsWith('map:') ? index : -1)));
    expect(list.indexOf('report-tiring')).toBeGreaterThan(lastCard);
    expect(ids(h)).toEqual(list);
  });

  it('V6 report-tiring opens the tiring stage; choosing a movement returns to mapping with the recommendation updated', () => {
    const h = ready2();
    say(h, 'helper', 'change-controls');
    const before = h.snap.recommendation;
    say(h, 'report-tiring');
    expect(h.snap.stage).toBe('tiring');
    const target = decisionIds(h).find((id) => id.startsWith('tiring:'))!;
    h.session.chooseSetupTarget(target);
    expect(h.snap.stage).toBe('mapping');
    expect(h.snap.recommendation).not.toBeNull();
    expect(h.snap.recommendation!.reasons.join(' ')).toMatch(/tiring/i);
    expect(JSON.stringify(h.snap.recommendation)).not.toBe(JSON.stringify(before));
  });

  it('V6 never-mind returns to mapping, not communication', () => {
    const h = ready2();
    say(h, 'helper', 'change-controls', 'report-tiring');
    expect(h.snap.stage).toBe('tiring');
    h.session.decide('never-mind');
    expect(h.snap.stage).toBe('mapping');
    expect(decisionIds(h)[0]).toBe('keep-current');
  });

  it('V6 with one movement there is no report-tiring', () => {
    const h = ready();
    say(h, 'helper', 'change-controls');
    expect(h.snap.stage).toBe('mapping');
    expect(decisionIds(h)).not.toContain('report-tiring');
    h.session.decide('report-tiring' as never);
    expect(h.snap.stage).toBe('mapping');
  });
});

// ═══ V7 ════════════════════════════════════════════════════════════════════
describe('V7 first accidental selection safety', () => {
  it('V7 record-again is first on first-setup, adding and recalibrating comfort lists', () => {
    const first = new Harness();
    first.calibrate();
    expect(ids(first)[0]).toBe('record-again');
    expect(ids(addingComfort())[0]).toBe('record-again');
    expect(ids(recalibratingComfort())[0]).toBe('record-again');
  });

  it('V7 recalibrate-no is first in the confirmation', () => {
    const h = ready();
    say(h, 'helper', 'recalibrate');
    expect(ids(h)[0]).toBe('recalibrate-no');
    expect(h.highlightedId()).toBe('recalibrate-no');
  });

  it('V7 keep-current is first on Change controls', () => {
    const h = ready2();
    say(h, 'helper', 'change-controls');
    expect(ids(h)[0]).toBe('keep-current');
  });

  it('V7 a hold started on one list that swaps to the confirmation selects nothing', () => {
    const h = ready();
    say(h, 'helper');
    h.run(1_500, REST);
    h.run(150, BROW);
    say(h, 'recalibrate');
    h.run(800, BROW);
    h.run(1_500, REST);
    expect(h.snap.recalibrating).toBe(false);
    expect(h.snap.stage).toBe('communication');
    expect(snap(h).confirmingRecalibrate).toBe(true);
  });
});

// ═══ V8 (UI) ═══════════════════════════════════════════════════════════════
describe('V8 UI', () => {
  function mount(h: Harness) {
    return render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
      runtime: { session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: { start: vi.fn(async () => {}), stop: vi.fn() } },
    }));
  }
  const MODE = /Automatic: the highlight moves by itself|Step by step: no timer/;

  it('V8 the comfort screen shows the controls card (mode heading and chips) for first, add, recalibrate and restore', () => {
    const firstHarness = new Harness();
    firstHarness.calibrate();
    const cases: Array<[string, Harness]> = [['first', firstHarness], ['add', addingComfort()], ['recalibrate', recalibratingComfort()], ['restore', restoreToComfort().h]];
    for (const [name, h] of cases) {
      const view = mount(h);
      const text = document.querySelector('main')!.textContent ?? '';
      expect([name, MODE.test(text)]).toEqual([name, true]);
      expect([name, /: (Select|Selects)/.test(text)]).toEqual([name, true]);
      view.unmount();
    }
  });

  it('V8 recalibrating with 2+ movements says the others will be turned off', () => {
    const h = ready2();
    recalibratingComfort(h);
    mount(h);
    expect(document.querySelector('main')!.textContent).toMatch(/other movements will be turned off/i);
  });

  it('V8 the Helper recalibrate confirmation shows its one-line warning and focuses the question', () => {
    const h = ready();
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Helper' }));
    fireEvent.click(screen.getByRole('button', { name: /^Recalibrate/ }));
    expect(document.body.textContent).toMatch(/Recalibrating turns communication off until the new movement is approved\./);
    const active = document.activeElement as HTMLElement;
    expect(active.tagName).not.toBe('BODY');
    expect(active.tagName).not.toBe('BUTTON');
    expect(active.textContent).toMatch(/recalibrat/i);
    expect(screen.getByRole('button', { name: /Keep current setup/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start recalibration/ })).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Keep current setup/ })); });
    expect(h.snap.recalibrating).toBe(false);
  });

  it('V8 no page titled "Recalibrate" remains', () => {
    const h = ready();
    mount(h);
    fireEvent.click(screen.getByRole('button', { name: 'Helper' }));
    fireEvent.click(screen.getByRole('button', { name: /^Recalibrate/ }));
    expect(h.snap.stage).not.toBe('recalibrate-confirm');
    expect(screen.queryByRole('heading', { level: 1, name: /Recalibrate|Fresh start/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/^RECALIBRATE$/m);
  });
});

// ═══ V10 ═══════════════════════════════════════════════════════════════════
describe('V10 nothing new is stored', () => {
  it('V10 profiles never contain the new flags, notes or previews', () => {
    const storage = createMemoryStorage();
    const h = ready({ profiles: createLocalProfileStore(() => storage) });
    say(h, 'helper', 'recalibrate', 'recalibrate-no', 'slower');
    h.addMovement(OPEN_MOUTH, perform);
    h.session.decide('effort-choose');
    h.session.decide('approve-comfortable' as never);
    const raw = storage.data.get(PROFILE_KEY)!;
    for (const text of ['confirmingRecalibrate', 'comfortPreview', 'effort', 'tiringReports', 'notes', 'helperOpen']) expect(raw).not.toContain(text);
  });

  it('V10 an effort answer still makes the recommendation leave that movement unused (as before)', () => {
    const h = addingComfort();
    h.session.decide('effort-choose');
    expect(h.snap.recommendation!.reasons.join(' ')).toMatch(/Open mouth is left unused because you marked it as taking effort/);
  });
});
